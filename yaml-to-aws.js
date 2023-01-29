/** @format */

const req = require("require-yml")
const { SSM } = require("@aws-sdk/client-ssm")
const { STSClient, GetCallerIdentityCommand } = require("@aws-sdk/client-sts")

class YamlToAws {
    awsAccount = ""
    secretKeyId = ""
    secretAccessKey = ""
    region = ""
    ssm = null
    stsclient = null

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
    async loadYamlToSSM(path, prefix) {
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
        this.logger.info(`Parameters to be set ${Object.keys(flatSettings).length} keys`)

        // loop through the flattened object and save each key/value pair to ssm
        for (const k in flatSettings) {
            const key = prefix + k.split("']['").join("/").replace("['", "").replace("']", "")
            const value = flatSettings[k]
            try {
                await this.saveSSMParameter(key, value)
                this.logger.info(`Saved SSM parameter ${key}`)
            } catch (err) {
                this.logger.error(`Failed to save SSM parameter ${key}: ${err}`)
            }
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
}

module.exports = YamlToAws
