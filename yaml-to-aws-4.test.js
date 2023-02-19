/** @format */

const YamlToAws = require("./yaml-to-aws")
const { SSM } = require("@aws-sdk/client-ssm")

// for the tests, we'll use a fake AWS account
const awsAccount = "123456789012"
const secretKeyId = "SECRET_ACCESS_KEY_ID"
const secretAccessKey = "SECRET_ACCESS_KEY"
const region = "us-east-1"

describe("deleteDeadParameters", () => {
    let deleteParametersMock

    beforeEach(() => {
        // Create a mock for the deleteParameters method
        deleteParametersMock = jest.spyOn(SSM.prototype, "deleteParameters")
        deleteParametersMock.mockImplementation(() => ({
            DeletedParameters: ["param1", "param2"],
            InvalidParameters: ["param3"],
        }))
    })

    afterEach(() => {
        // Restore the original deleteParameters method
        deleteParametersMock.mockRestore()
    })

    it("should delete the given dead parameters", async () => {
        const deadParameters = ["param1", "param2"]
        const instance = new YamlToAws(awsAccount, secretKeyId, secretAccessKey, region)

        const deletedCount = await instance.deleteDeadParameters(deadParameters)

        expect(deletedCount).toEqual(2)
        expect(deleteParametersMock).toHaveBeenCalledTimes(1)
        expect(deleteParametersMock).toHaveBeenCalledWith({ Names: deadParameters })
    })

    it("should convert a map of dead parameters to an array", async () => {
        const deadParameters = new Map([
            ["param1", "value1"],
            ["param2", "value2"],
        ])
        const instance = new YamlToAws(awsAccount, secretKeyId, secretAccessKey, region)

        const deletedCount = await instance.deleteDeadParameters(deadParameters)

        expect(deletedCount).toEqual(2)
        expect(deleteParametersMock).toHaveBeenCalledTimes(1)
        expect(deleteParametersMock).toHaveBeenCalledWith({ Names: ["param1", "param2"] })
    })

    it("should convert a comma-separated string of dead parameters to an array", async () => {
        const deadParameters = "param1,param2"
        const instance = new YamlToAws(awsAccount, secretKeyId, secretAccessKey, region)

        const deletedCount = await instance.deleteDeadParameters(deadParameters)

        expect(deletedCount).toEqual(2)
        expect(deleteParametersMock).toHaveBeenCalledTimes(1)
        expect(deleteParametersMock).toHaveBeenCalledWith({ Names: ["param1", "param2"] })
    })

    it("should throw an error if the deadParameters argument is not an array, string or Map", async () => {
        const deadParameters = 123 // Invalid parameter type
        const instance = new YamlToAws(awsAccount, secretKeyId, secretAccessKey, region)

        await expect(instance.deleteDeadParameters(deadParameters)).rejects.toThrow("Invalid parameter type for deadParameters: number")
        expect(deleteParametersMock).not.toHaveBeenCalled()
    })

    it("should log an error and rethrow the error if the SSM API call fails", async () => {
        const error = new Error("SSM API error")
        deleteParametersMock.mockRejectedValueOnce(error)

        const deadParameters = ["param1", "param2"]
        const instance = new YamlToAws(awsAccount, secretKeyId, secretAccessKey, region)

        await expect(instance.deleteDeadParameters(deadParameters)).rejects.toThrow(`Failed to delete dead parameters: ${error}`)
        expect(deleteParametersMock).toHaveBeenCalledTimes(1)
        expect(deleteParametersMock).toHaveBeenCalledWith({ Names: deadParameters })
    })

    it("should not call the SSM API if there are no dead parameters", async () => {
        const deadParameters = []
        const instance = new YamlToAws(awsAccount, secretKeyId, secretAccessKey, region)

        const deletedCount = await instance.deleteDeadParameters(deadParameters)

        expect(deletedCount).toEqual(0)
        expect(deleteParametersMock).not.toHaveBeenCalled()
    })
})
