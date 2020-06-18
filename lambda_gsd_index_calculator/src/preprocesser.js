const { BUCKET, FILE, RESULT_FOLDER, REGION, QUEUE_NAME } = process.env

const AWS = require('aws-sdk')
const moment = require('moment')
const s3 = new AWS.S3()
const sqs = new AWS.SQS({
  region: REGION,
})

const { promisify } = require('util')

const getS3Object = promisify(s3.getObject).bind(s3)
const putS3Object = promisify(s3.putObject).bind(s3)
const sendSQSMessage = promisify(sqs.sendMessage).bind(sqs)

const readFile = async (bucketName, fileName) => {
  const params = {
    Bucket: bucketName,
    Key: fileName,
  }

  const data = await getS3Object(params)
  return data.Body.toString('utf-8')
}

const putFile = async (fileContent) => {
  const currentmTimeStamp = moment().valueOf()
  const fileName = `${currentmTimeStamp}_processedUpdates.json`
  await putS3Object({
    Bucket: BUCKET,
    Key: `${RESULT_FOLDER}/${fileName}`,
    Body: JSON.stringify(fileContent),
  })

  return fileName
}

// TODO:
const filterUnnecessaryUpdates = (tasksUpdateArray) => {
  const filteredTaskUpdateArray = tasksUpdateArray.filter(updateEntry =>
    updateEntry['OldImage']['statusId'] !== updateEntry['NewImage']['statusId'])
  
  return filteredTaskUpdateArray
}

module.exports.readandFilterFile = async (event, context) => {
  console.log('+++event', event)
  console.log('+++context', context)
  try {
    const inputFileName = (event && event.fileName) || FILE
    const s3FileContentAsString = await readFile(BUCKET, inputFileName)
    const s3FileContent = JSON.parse(s3FileContentAsString)
    const cleanTaskUpdates = filterUnnecessaryUpdates(s3FileContent)
    const fileName = await putFile(cleanTaskUpdates)

    console.log('+++fileName', fileName)

    const accountId = context.invokedFunctionArn.split(":")[4]
    const queueUrl = `https://sqs.${REGION}.amazonaws.com/${accountId}/${QUEUE_NAME}`

    const sqsPayload = {
      MessageBody: fileName,
      QueueUrl: queueUrl,
    }

    // Sends single message to SQS for further process
    const test = await sendSQSMessage(sqsPayload)

    console.log('+++sqsPayload', sqsPayload)
    console.log('+++test', test)

    const responseBody = {
      fileName,
      queueUrl,
    }
    const response = {
      statusCode: 200,
      body: JSON.stringify(responseBody),
    }

    return response
  } catch (err) {
    return {
      statusCode: err.statusCode || 400,
      body: err.message || JSON.stringify(err.message)
    }
  }
}
