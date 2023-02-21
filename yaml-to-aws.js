/** @format */

const req = require("require-yml")
const { SSM } = require("@aws-sdk/client-ssm")
const { STSClient, GetCallerIdentityCommand } = require("@aws-sdk/client-sts")

const DEFAULT_BATCH_COUNT = 20 // set the number of requests after which to pause
const DEFAULT_PAUSE_TIME_MS = 1500 // set the duration of the pause in milliseconds
const DEFAULT_MAX_SAVE_ATTEMPTS = 5 // set the maximum number of attempts to save a parameter

class YamlToAws {
    awsAccount = ""
    secretKeyId = ""
    secretAccessKey = ""
    region = ""
    ssm = null
    stsclient = null
    batchCount = DEFAULT_BATCH_COUNT
    pauseTimeMs = DEFAULT_PAUSE_TIME_MS
    maxSaveAttempts = DEFAULT_MAX_SAVE_ATTEMPTS

    // base logger that just logs to console
    logger = {
        info: function () {
            console.info(...arguments)
        },
        debug: function () {
            console.debug(...arguments)
        },
        error: function () {
            console.error(...arguments)
        },
    }

    /**
     *
     * @param {*} awsAccount
     * @param {*} secretKeyId
     * @param {*} secretAccessKey
     * @param {*} region
     */
    constructor(awsAccount, secretKeyId, secretAccessKey, region) {
        this.awsAccount = awsAccount
        this.secretKeyId = secretKeyId
        this.secretAccessKey = secretAccessKey
        this.region = region

        // login to aws
        const config = {
            credentials: {
                accessKeyId: this.secretKeyId,
                secretAccessKey: this.secretAccessKey,
            },
            region: this.region,
        }

        this.ssm = new SSM(config)
        this.stsclient = new STSClient(config)
    }

    setLogger(logger) {
        this.logger = logger
    }

    /**
     * flattens an object into a single level
     * keys for the new object are strings containing the
     * original object keys separated by bracket notation
     *
     * optionally pass true as a second parameter to preserve
     * arrays as arrays and not recurse into them
     *
     * @param {*} o the object to flatten
     * @param {boolean} keepArrays  (optional) set to true keep arrays
     * @returns a flattened object
     */
    flattenObject(o, keepArrays) {
        var tempA = {}
        for (let i in o) {
            if (keepArrays === true && Array.isArray(o[i])) {
                tempA["['" + i + "']"] = o[i]
                continue
            }
            if (typeof o[i] == "object") {
                var tempB = this.flattenObject(o[i], keepArrays)
                for (let j in tempB) {
                    tempA["['" + i + "']" + j] = tempB[j]
                }
            } else {
                tempA["['" + i + "']"] = o[i]
            }
        }
        // log out the total number of keys in the flattened object
        return tempA
    }

    /**
     *
     * @param {*} path  The path to the yaml file(s)
     * @param {*} prefix The prefix to use for the ssm parameters
     */
    async loadYamlToSSM(path, prefix, options = {}) {
        // set the pause params if set in options
        if (options.batchCount) {
            this.batchCount = options.batchCount
        }
        if (options.pauseTimeMs) {
            this.pauseTimeMs = options.pauseTimeMs
        }
        if (options.maxSaveAttempts) {
            this.maxSaveAttempts = options.maxSaveAttempts
        }

        // check the account id vs the one attached to the credentials
        await this.checkAccountID(this.awsAccount)

        // ensure the prefix starts with a slash
        prefix = prefix.startsWith("/") ? prefix : `/${prefix}`
        // ensure the prefix ends with a slash
        prefix = prefix.endsWith("/") ? prefix : `${prefix}/`

        // load the yaml file(s) into an object
        const settings = req(path)

        this.logger.info(`Loaded ${path} into settings object`)

        // flatten the object
        const flatSettings = this.flattenObject(settings, true)
        this.logger.info(`Parameters to load ${Object.keys(flatSettings).length} `)

        // fetch the current parameters from ssm under the prefix
        const currentParameters = await this.getExistingSSMParameters(prefix)

        this.logger.info(`Current parameters found ${currentParameters.size} `)

        let skipped = 0
        let updated = 0
        let deleted = 0
        let created = 0
        const existing = currentParameters.size

        // loop through the flattened object and save each key/value pair to ssm
        let requestCount = 0
        for (const k in flatSettings) {
            const key = prefix + k.split("']['").join("/").replace("['", "").replace("']", "")
            const value = flatSettings[k]

            const compareValue = Array.isArray(value) ? value.join(",") : value + ""

            // Check if the key exists in currentParameters and if the value is different
            if (currentParameters.has(key)) {
                if (currentParameters.get(key) === compareValue) {
                    currentParameters.delete(key) // Remove the key from currentParameters
                    this.logger.info(`Skipping parameter ${key} as it has not changed`)
                    skipped++
                    continue // Skip saving the parameter.
                } else {
                    this.logger.info(`Updating parameter ${key} as it has changed`)
                    updated++
                }
            } else {
                this.logger.info(`Creating parameter ${key} as it does not exist`)
                created++
            }

            let saveAttempt = 1
            let saved = false
            while (saveAttempt <= this.maxSaveAttempts && !saved) {
                try {
                    await this.saveSSMParameter(key, value)
                    saved = true
                    this.logger.info(`Saved parameter ${key}`)
                } catch (err) {
                    this.logger.error(`Failed to save SSM parameter ${key} on attempt ${saveAttempt}: ${err}`)
                    if (err.code === "ThrottlingException") {
                        // If throttling occurs, pause for an increaseing amount of time before retrying
                        await new Promise((resolve) => setTimeout(resolve, this.pauseTimeMs * (saveAttempt + 1)))
                    } else {
                        break // If the error is not a throttling exception, stop retrying
                    }
                }
                saveAttempt++
            }

            if (!saved) {
                this.logger.error(`Could not save SSM parameter ${key} after ${this.maxSaveAttempts} attempts`)
            }

            currentParameters.delete(key) // Remove the key from currentParameters
            requestCount++
            if (requestCount % this.batchCount === 0) {
                await new Promise((resolve) => setTimeout(resolve, this.pauseTimeMs))
            }
        }

        if (options.clean) {
            // Delete any parameters that are no longer in the yaml file
            deleted = await this.deleteDeadParameters(currentParameters)
            this.logger.info(`Deleted ${deleted} parameters`)
        } else {
            this.logger.info(`The following, ${currentParameters.size} extra parameters were found in prefix ${prefix}, set clean to true to remove them:`)
            // list the extra parameters
            for (const key of currentParameters.keys()) {
                this.logger.info(` ● ${key}`)
            }
        }

        return {
            parameters: Object.keys(flatSettings).length,
            existing: existing,
            updated: updated,
            unchanged: skipped,
            deleted: options.clean ? deleted : 0,
            created: created,
        }
    }

    /**
     * This function saves an SSM parameter to the AWS SSM Parameter Store.
     * If the parameter value is an array, it saves it as an SSM StringList parameter.
     * If the parameter value is a string or a number, it saves it as an SSM String parameter.
     * @param {*} key
     * @param {*} value
     * @returns
     */
    async saveSSMParameter(key, value) {
        if (Array.isArray(value)) {
            // Convert any numbers in the array to strings
            const stringValues = value.map((val) => (typeof val === "number" ? String(val) : val))
            return await this.saveStringListParameterSync(key, stringValues)
        } else if (typeof value === "string") {
            return await this.saveStringParameterSync(key, value)
        } else if (typeof value === "number") {
            // Convert numbers to strings before saving
            return await this.saveStringParameterSync(key, String(value))
        } else {
            throw new Error(`Invalid parameter value: ${value}`)
        }
    }

    async saveStringListParameterSync(key, values) {
        const params = { Name: key, Value: values.join(","), Type: "StringList", Overwrite: true }
        try {
            await this.ssm.putParameter(params)
            return `Successfully saved SSM parameter ${key} with values: ${values.join(", ")}`
        } catch (err) {
            throw new Error(`Failed to save SSM parameter ${key}: ${err}`)
        }
    }

    async saveStringParameterSync(key, value) {
        const params = { Name: key, Value: value, Type: "String", Overwrite: true }
        try {
            await this.ssm.putParameter(params)
            // this.ssm.putParameterSync(params)
            return `Successfully saved SSM parameter ${key} with value: ${value}`
        } catch (err) {
            throw new Error(`Failed to save SSM parameter ${key}: ${err}`)
        }
    }

    async checkAccountID(expectedAccountID) {
        this.logger.info(`Checking the AWS account ID in the credentials against the expected account ID (${expectedAccountID})...`)

        try {
            const command = new GetCallerIdentityCommand({})
            const response = await this.stsclient.send(command)

            this.logger.info(`The AWS account ID in the credentials is ${response.Account}.`)

            // get the account id from the response
            const actualAccountID = response.Account

            // check the account id against the expected account id
            if (actualAccountID !== expectedAccountID) {
                this.logger.error(`The AWS account ID in the credentials (${actualAccountID}) does not match the expected account ID (${expectedAccountID}).`)
                throw new Error(`The AWS account ID in the credentials (${actualAccountID}) does not match the expected account ID (${expectedAccountID}).`)
            } else {
                this.logger.info(`The AWS account ID in the credentials matches the expected account ID (${expectedAccountID}).`)
            }
        } catch (error) {
            this.logger.error(`Failed to get the AWS account ID from the credentials: ${error}`)
            throw new Error(`Failed to get the AWS account ID from the credentials: ${error}`)
        }
    }

    /**
     * gets all the existing ssm parameters that start with the prefix
     * @param {*} prefix
     */
    async getExistingSSMParameters(prefix) {
        const params = {
            Path: prefix,
            Recursive: true,
            WithDecryption: true,
        }
        const parameters = new Map()
        let nextToken
        try {
            do {
                const response = await this.ssm.getParametersByPath({
                    ...params,
                    NextToken: nextToken,
                })

                this.logger.info(`Found ${response.Parameters.length} parameters under ${prefix}`)
                this.logger.info(response)

                for (const parameter of response.Parameters) {
                    parameters.set(parameter.Name, parameter.Value)
                }
                nextToken = response.NextToken
            } while (nextToken)
            return parameters
        } catch (err) {
            throw new Error(`Failed to get existing SSM parameters: ${err}`)
        }
    }

    /**
     * deletes parameters that are no longer in the yaml file
     * @param {*} deadParameters
     */
    async deleteDeadParameters(deadParameters) {
        // if deadParameters is a map or string then convert it to an array
        if (deadParameters instanceof Map) {
            deadParameters = Array.from(deadParameters.keys())
        } else if (typeof deadParameters === "string") {
            deadParameters = deadParameters.split(",")
        } else if (!Array.isArray(deadParameters)) {
            throw new Error(`Invalid parameter type for deadParameters: ${typeof deadParameters}`)
        }

        // if there are no dead parameters then return
        if (deadParameters.length === 0) {
            this.logger.info("No dead parameters to delete")
            return 0
        }

        try {
            const params = { Names: deadParameters }
            const response = await this.ssm.deleteParameters(params)
            this.logger.info(`Deleted ${response.DeletedParameters.length} parameters`)
            // list all the paramters that were deleted
            for (const parameter of response.DeletedParameters) {
                this.logger.info(`Deleted parameter ${parameter}`)
            }
            this.logger.info(`Failed to delete ${response.InvalidParameters.length} parameters`)
            // list all the paramters that failed to delete
            for (const parameter of response.InvalidParameters) {
                this.logger.info(`Failed to delete parameter ${parameter}`)
            }
            return response.DeletedParameters.length
        } catch (error) {
            this.logger.error(`Failed to delete dead parameters: ${error}`)
            throw new Error(`Failed to delete dead parameters: ${error}`)
        }
    }
}

module.exports = YamlToAws
