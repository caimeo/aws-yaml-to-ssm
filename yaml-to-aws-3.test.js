/** @format */

const { SSM } = require("@aws-sdk/client-ssm")
const { STSClient } = require("@aws-sdk/client-sts")
const YamlToAws = require("./yaml-to-aws")

const putParameterSpy = jest.spyOn(SSM.prototype, "putParameter")
putParameterSpy.mockImplementation((params) => {
    console.log("putParameter called with:", params)
    return {
        promise: jest.fn().mockResolvedValue({}),
    }
})

const deleteParametersMock = jest.spyOn(SSM.prototype, "deleteParameters")
deleteParametersMock.mockImplementation(() => ({
    DeletedParameters: ["param1", "param2"],
    InvalidParameters: ["param3"],
}))

const getParametersByPath = jest.spyOn(SSM.prototype, "getParametersByPath")

describe("YamlToAws", () => {
    beforeEach(() => {
        getParametersByPath.mockReset()
        putParameterSpy.mockReset()
    })

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
            getParametersByPath.mockReturnValueOnce({ Parameters: [] })

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

    describe("loadYamlToSSM", () => {
        it("should flatten the settings object and save it to SSM with a custom prefix but only changed values", async () => {
            const prefix = "/myPrefix"
            const existingParameters = [
                { Name: `${prefix}/level2a/level2a/key2aa`, Value: "testVal2aa" },
                // { Name: `${prefix}/level2b/level2b/key2ba`, Value: "testVal2ba" }, // <-- missing
                { Name: `${prefix}/level2b/level2b/key2bb`, Value: "555" }, // <-- different value
                { Name: `${prefix}/lvl1/key1a`, Value: "testVal1a" },
                { Name: `${prefix}/lvl1/key1b`, Value: "42" },
                { Name: `${prefix}/lvl1/array1`, Value: "testVal1c,testVal1d,testVal1e" },
            ]

            getParametersByPath.mockReturnValueOnce({ Parameters: existingParameters })

            const yamlToAws = new YamlToAws("00000000000", "secretKeyId", "secretAccessKey", "us-east-1")

            const stsclientSendMock = jest.spyOn(STSClient.prototype, "send")
            const response = { Account: "00000000000" }
            stsclientSendMock.mockResolvedValueOnce(response)

            await yamlToAws.loadYamlToSSM("./testData/yamlSource1", prefix)

            expect(putParameterSpy).toHaveBeenCalledTimes(2)
            expect(putParameterSpy).toHaveBeenCalledWith({ Name: "/myPrefix/level2b/level2b/key2ba", Value: "testVal2ba", Type: "String", Overwrite: true })
            expect(putParameterSpy).toHaveBeenCalledWith({ Name: "/myPrefix/level2b/level2b/key2bb", Value: "5", Type: "String", Overwrite: true })
        })
    })
})
