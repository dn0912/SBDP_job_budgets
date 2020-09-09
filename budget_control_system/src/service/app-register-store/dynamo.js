import AWS from 'aws-sdk'
import uuid from 'node-uuid'

const credentials = new AWS.SharedIniFileCredentials({ profile: process.env.AWS_PROFILE })
AWS.config.credentials = credentials

console.log('+++process.env', process.env.AWS_RESOURCE_REGION)

AWS.config.update({
  region: process.env.AWS_RESOURCE_REGION,
})

const dynamoDocClient = new AWS.DynamoDB.DocumentClient()
// const update = promisify(dynamoDb.update.bind(dynamoDb))

class DynamoDB {
  constructor(tableName) {
    // this.tableName = 'trace-record'
    this.tableName = tableName
    this.ddb = dynamoDocClient
  }

  async put(appData) {
    try {
      // const storeItem = {
      //   appId: uuid.v4(),
      //   ...appData,
      // }

      const appId = `app-${uuid.v4()}`
      const storeItem = {
        appId,
        ...appData,
      }

      const docClientParams = {
        TableName: this.tableName,
        Item: storeItem,
        ReturnValues: 'ALL_OLD',
      }
      await this.ddb.put(docClientParams).promise()
      return storeItem
    } catch (err) {
      console.log('err', err)
    }
  }

  async get(appId) {
    try {
      const param = {
        TableName: this.tableName,
        Key: {
          appId,
        },
      }
      const dbRecord = await this.ddb.get(param).promise()
      return dbRecord
    } catch (err) {
      console.log('err', err)
    }
  }
}

export default DynamoDB
