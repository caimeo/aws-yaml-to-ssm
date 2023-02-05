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
        const clean = core.getInput("clean") || false

        const y2a = new yamlToAws(awsAccountId, secretKeyId, secretAccessKey, region)

        core.info(`YamlToAws: ${path} load to SSM with prefix ${prefix}!`)

        y2a.setLogger(core)
        const result = await y2a.loadYamlToSSM(path, prefix, { clean: clean })

        core.setOutput("parameters", result.parameters)
        core.setOutput("existing", result.existing)
        core.setOutput("created", result.created)
        core.setOutput("updated", result.updated)
        core.setOutput("deleted", result.deleted)
        core.setOutput("unchanged", result.unchanged)

        core.setOutput("time", new Date().toTimeString())
    } catch (error) {
        core.setFailed(error.message)
    }
}

run()
