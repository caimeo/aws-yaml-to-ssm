/** @format */

const { SSM } = require("@aws-sdk/client-ssm")
const YamlToAws = require("./yaml-to-aws")

// for the tests, we'll use a fake AWS account
const awsAccount = "123456789012"
const secretKeyId = "SECRET_ACCESS_KEY_ID"
const secretAccessKey = "SECRET_ACCESS_KEY"
const region = "us-east-1"

describe("YamlToAws", () => {
    const getParametersByPath = jest.spyOn(SSM.prototype, "getParametersByPath")

    beforeEach(() => {
        getParametersByPath.mockReset()
    })

    test("getParametersByPath returns 3 values", async () => {
        const response = {
            Parameters: [
                { Name: "/my-prefix/param1", Value: "value1" },
                { Name: "/my-prefix/param2", Value: "value2" },
                { Name: "/my-prefix/param3", Value: "value3" },
            ],
        }
        getParametersByPath.mockReturnValueOnce(response)

        const instance = new YamlToAws(awsAccount, secretKeyId, secretAccessKey, region)
        const params = await instance.getExistingSSMParameters("/my-prefix")

        const expectedParams = new Map()
        expectedParams.set("/my-prefix/param1", "value1")
        expectedParams.set("/my-prefix/param2", "value2")
        expectedParams.set("/my-prefix/param3", "value3")

        expect(params).toEqual(expectedParams)
        expect(getParametersByPath).toHaveBeenCalledTimes(1)
        expect(getParametersByPath).toHaveBeenCalledWith({
            Path: "/my-prefix",
            Recursive: true,
            WithDecryption: true,
        })
    })

    test("getParametersByPath returns an empty map when there are no parameters", async () => {
        const response = { Parameters: [] }
        getParametersByPath.mockReturnValueOnce(response)

        const instance = new YamlToAws(awsAccount, secretKeyId, secretAccessKey, region)
        const params = await instance.getExistingSSMParameters("/my-prefix")

        const expectedParams = new Map()

        expect(params).toEqual(expectedParams)
        expect(getParametersByPath).toHaveBeenCalledTimes(1)
        expect(getParametersByPath).toHaveBeenCalledWith({
            Path: "/my-prefix",
            Recursive: true,
            WithDecryption: true,
        })
    })

    test("getExistingSSMParameters returns all parameters when pagination is required with NextToken", async () => {
        const parameters = []
        for (let i = 1; i <= 60; i++) {
            parameters.push({ Name: `/my-prefix/param${i}`, Value: `value${i}` })
        }

        const response1 = { Parameters: parameters.slice(0, 20), NextToken: "token1" }
        const response2 = { Parameters: parameters.slice(20, 40), NextToken: "token2" }
        const response3 = { Parameters: parameters.slice(40) }

        getParametersByPath.mockReturnValueOnce(response1).mockReturnValueOnce(response2).mockReturnValueOnce(response3)

        const instance = new YamlToAws(awsAccount, secretKeyId, secretAccessKey, region)
        const params = await instance.getExistingSSMParameters("/my-prefix")

        const expectedParams = new Map()
        for (const parameter of parameters) {
            expectedParams.set(parameter.Name, parameter.Value)
        }

        expect(params).toEqual(expectedParams)
        expect(getParametersByPath).toHaveBeenCalledTimes(3)
        expect(getParametersByPath).toHaveBeenNthCalledWith(1, {
            Path: "/my-prefix",
            Recursive: true,
            WithDecryption: true,
        })
        expect(getParametersByPath).toHaveBeenNthCalledWith(2, {
            Path: "/my-prefix",
            Recursive: true,
            WithDecryption: true,
            NextToken: "token1",
        })
        expect(getParametersByPath).toHaveBeenNthCalledWith(3, {
            Path: "/my-prefix",
            Recursive: true,
            WithDecryption: true,
            NextToken: "token2",
        })
    })

    test("getExistingSSMParameters throws an error when the SSM API call fails", async () => {
        const error = new Error("SSM API error")
        getParametersByPath.mockRejectedValueOnce(error)

        const instance = new YamlToAws(new SSM())
        await expect(instance.getExistingSSMParameters("/my-prefix")).rejects.toThrow(`Failed to get existing SSM parameters: ${error}`)
        expect(getParametersByPath).toHaveBeenCalledTimes(1)
        expect(getParametersByPath).toHaveBeenCalledWith({
            Path: "/my-prefix",
            Recursive: true,
            WithDecryption: true,
        })
    })
})

// this test always passes
describe("nothing", () => {
    test("nothing", () => {
        expect(true).toBe(true)
    })
})
