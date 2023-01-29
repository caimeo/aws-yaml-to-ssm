/** @format */

const { SSM } = require("@aws-sdk/client-ssm")
const { STSClient, GetCallerIdentityCommand } = require("@aws-sdk/client-sts")
const YamlToAws = require("./yaml-to-aws")

const putParameterSpy = jest.spyOn(SSM.prototype, "putParameter")
putParameterSpy.mockImplementation((params) => {
    console.log("putParameter called with:", params)
    return {
        promise: jest.fn().mockResolvedValue({}),
    }
})

describe("YamlToAws", () => {
    describe("constructor", () => {
        it("should create an instance of the class with the provided credentials", () => {
            const awsAccount = "123456789012"
            const secretKeyId = "SECRET_ACCESS_KEY_ID"
            const secretAccessKey = "SECRET_ACCESS_KEY"
            const region = "us-east-1"

            const instance = new YamlToAws(awsAccount, secretKeyId, secretAccessKey, region)

            expect(instance.awsAccount).toEqual(awsAccount)
            expect(instance.secretKeyId).toEqual(secretKeyId)
            expect(instance.secretAccessKey).toEqual(secretAccessKey)
            expect(instance.region).toEqual(region)
            expect(instance.ssm).toBeInstanceOf(SSM)
            expect(instance.stsclient).toBeInstanceOf(STSClient)
        })
    })

    describe("flattenObject", () => {
        it("should flatten an object into a single level", () => {
            const obj = { a: { b: { c: "value" } }, d: "value" }
            const instance = new YamlToAws()
            expect(instance.flattenObject(obj)).toEqual({ "['a']['b']['c']": "value", "['d']": "value" })
        })

        it("should preserve arrays when keepArrays is true", () => {
            const obj = { a: { b: [1, 2, 3] } }
            const instance = new YamlToAws()
            expect(instance.flattenObject(obj, true)).toEqual({ "['a']['b']": [1, 2, 3] })
        })
    })

    describe("loadYamlToSSM", () => {
        it("should flatten the settings object and save it to SSM with a custom prefix", async () => {
            const yamlToAws = new YamlToAws("00000000000", "secretKeyId", "secretAccessKey", "us-east-1")

            const stsclientSendMock = jest.spyOn(STSClient.prototype, "send")
            const response = { Account: "00000000000" }
            stsclientSendMock.mockResolvedValueOnce(response)

            await yamlToAws.loadYamlToSSM("./testData/yamlSource1", "myPrefix")

            expect(putParameterSpy).toHaveBeenCalledTimes(6)

            expect(putParameterSpy).toHaveBeenCalledWith({ Name: "/myPrefix/level2a/level2a/key2aa", Value: "testVal2aa", Type: "String", Overwrite: true })
            expect(putParameterSpy).toHaveBeenCalledWith({ Name: "/myPrefix/level2b/level2b/key2ba", Value: "testVal2ba", Type: "String", Overwrite: true })
            expect(putParameterSpy).toHaveBeenCalledWith({ Name: "/myPrefix/level2b/level2b/key2bb", Value: "5", Type: "String", Overwrite: true })
            expect(putParameterSpy).toHaveBeenCalledWith({ Name: "/myPrefix/lvl1/key1a", Value: "testVal1a", Type: "String", Overwrite: true })
            expect(putParameterSpy).toHaveBeenCalledWith({ Name: "/myPrefix/lvl1/key1b", Value: "42", Type: "String", Overwrite: true })
            expect(putParameterSpy).toHaveBeenCalledWith({ Name: "/myPrefix/lvl1/array1", Value: "testVal1c,testVal1d,testVal1e", Type: "StringList", Overwrite: true })
        })
    })
})

describe("checkAccountID", () => {
    let stsclientSendMock
    let instance

    beforeEach(() => {
        instance = new YamlToAws()
        stsclientSendMock = jest.spyOn(STSClient.prototype, "send")
    })

    afterEach(() => {
        instance = null
        stsclientSendMock.mockRestore()
    })

    test("returns nothing if account ID matches", async () => {
        const expectedAccountID = "1234567890"
        const response = { Account: expectedAccountID }
        stsclientSendMock.mockResolvedValueOnce(response)

        await expect(instance.checkAccountID(expectedAccountID)).resolves.toBeUndefined()
        expect(stsclientSendMock).toHaveBeenCalledWith(expect.any(GetCallerIdentityCommand))
    })

    test("throws an error if account ID does not match", async () => {
        const expectedAccountID = "1234567890"
        const response = { Account: "0987654321" }
        stsclientSendMock.mockResolvedValueOnce(response)

        await expect(instance.checkAccountID(expectedAccountID)).rejects.toThrow(`The AWS account ID in the credentials (${response.Account}) does not match the expected account ID (${expectedAccountID}).`)
        expect(stsclientSendMock).toHaveBeenCalledWith(expect.any(GetCallerIdentityCommand))
    })

    test("throws an error if STSClient.send() fails", async () => {
        const expectedAccountID = "1234567890"
        const error = new Error("STSClient.send() failed")
        stsclientSendMock.mockRejectedValueOnce(error)

        await expect(instance.checkAccountID(expectedAccountID)).rejects.toThrow(`Failed to get the AWS account ID from the credentials: ${error}`)
        expect(stsclientSendMock).toHaveBeenCalledWith(expect.any(GetCallerIdentityCommand))
    })
})