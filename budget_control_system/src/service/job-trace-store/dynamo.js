import AWS from 'aws-sdk'
import uuid from 'node-uuid'

const credentials = new AWS.SharedIniFileCredentials({ profile: process.env.AWS_PROFILE })
AWS.config.credentials = credentials

console.log('+++process.env', process.env.AWS_RESOURCE_REGION)

AWS.config.update({
  region: process.env.AWS_RESOURCE_REGION,
})

// const update = promisify(dynamoDb.update.bind(dynamoDb))

const tableName = 'job-trace-record'

class DynamoDB {
  constructor() {
    // this.tableName = 'trace-record'
    this.ddb = new AWS.DynamoDB.DocumentClient()
  }

  async put(item) {
    try {
      const storeItem = {
        jobId: uuid.v4(),
        ...item,
      }

      const docClientParams = {
        TableName: tableName,
        Item: storeItem,
        ReturnValues: 'ALL_OLD',
      }
      await this.ddb.put(docClientParams).promise()
      return storeItem
    } catch (err) {
      console.log('err', err)
    }
  }

  async get(jobId) {
    try {
      const param = {
        TableName: tableName,
        Key: {
          jobId,
        },
      }
      const dbRecord = await this.ddb.get(param).promise()
      console.log('+++dbRecord', dbRecord)
      return dbRecord.Item || null
    } catch (err) {
      console.log('err', err)
    }
  }
}

export default DynamoDB
