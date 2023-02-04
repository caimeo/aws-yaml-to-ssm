/** @format */

const { STSClient, GetCallerIdentityCommand } = require("@aws-sdk/client-sts")
const YamlToAws = require("./yaml-to-aws")

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
