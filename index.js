/** @format */

const core = require("@actions/core")
// const github = require("@actions/github")
const yamlToAws = require("./yaml-to-aws")

// most @actions toolkit packages have async methods
async function run() {
    try {
        const path = core.getInput("path")
        const prefix = core.getInput("prefix")
        const awsAccountId = core.getInput("aws_account_id")
        const secretKeyId = core.getInput("aws_access_key_id")
        const secretAccessKey = core.getInput("aws_secret_access_key")
        const region = core.getInput("aws_region")

        const y2a = new yamlToAws(awsAccountId, secretKeyId, secretAccessKey, region)
        y2a.setLogger(core)
        await y2a.loadYamlToSSM(path, prefix)

        core.info(`YamlToAws: ${path} loaded to SSM with prefix ${prefix}!`)

        core.setOutput("time", new Date().toTimeString())
    } catch (error) {
        core.setFailed(error.message)
    }
}

run()
