const { BUCKET, FILE, SUBRESULT_FOLDER, REGION, QUEUE_NAME } = process.env

const AWSXRay = require('aws-xray-sdk-core')
const AWS = AWSXRay.captureAWS(require('aws-sdk'))
const TracedAWS = require('service-cost-tracer')

const moment = require('moment')
const tracedS3 = new TracedAWS.S3()

const tracedSQS = new TracedAWS.SQS({
  region: REGION,
})

const { promisify } = require('util')

const getS3Object = promisify(tracedS3.getObject).bind(tracedS3)
const tracedPutObject = promisify(tracedS3.tracedPutObject).bind(tracedS3)
const tracedSendMessage = promisify(tracedSQS.tracedSendMessage).bind(tracedSQS)

// TODO: remove later
// simulate slow function
const _slowDown = async (ms) => {
  console.log('+++Take it easy!?!')
  await new Promise(resolve => setTimeout(resolve, ms))
}

const _readFile = async (fileName) => {
  const params = {
    Bucket: BUCKET,
    Key: fileName,
  }

  const data = await getS3Object(params)
  return data.Body.toString('utf-8')
}

const _putFile = async (fileContent, jobId) => {
  const currentTimeStamp = moment().valueOf()
  const fileName = `${currentTimeStamp}_processedUpdates.json`
  const params = {
    Bucket: BUCKET,
    Key: `${SUBRESULT_FOLDER}/${fileName}`,
    Body: JSON.stringify(fileContent),
  }
  await tracedPutObject(params, jobId)

  return fileName
}

// TODO:
const _filterUnnecessaryUpdates = (tasksUpdateArray) => {
  const filteredTaskUpdateArray = tasksUpdateArray.filter(updateEntry =>
    updateEntry['OldImage']['statusId'] !== updateEntry['NewImage']['statusId'])
  
  return filteredTaskUpdateArray
}

module.exports.readAndFilterFile = async (event, context) => {
  console.log('+++event', JSON.stringify(event, undefined, 2))
  console.log('+++context', context)
  try {
    const jobId = event.jobId
    // Tracing
    const lambdaSubsegment = TracedAWS.startLambdaTracer(context, jobId)

    const inputFileName = (event && event.fileName) || FILE
    const s3FileContentAsString = await _readFile(inputFileName)
    const s3FileContent = JSON.parse(s3FileContentAsString)
    const cleanTaskUpdates = _filterUnnecessaryUpdates(s3FileContent)

    const fileName = await _putFile(cleanTaskUpdates, jobId)

    console.log('+++fileName', fileName)

    const accountId = context.invokedFunctionArn.split(":")[4]
    const queueUrl = `https://sqs.${REGION}.amazonaws.com/${accountId}/${QUEUE_NAME}`

    const messageBody = {
      fileName,
      jobId,
      // junk: ('x').repeat(1024*240)
    }

    const sqsPayload = {
      MessageBody: JSON.stringify(messageBody),
      QueueUrl: queueUrl,
    }

    // Sends single message to SQS for further process
    const test = await tracedSendMessage(sqsPayload, jobId)

    await _slowDown(5000)

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

    // TRACING
    TracedAWS.stopLambdaTracer(lambdaSubsegment)

    return response
  } catch (err) {
    return {
      statusCode: err.statusCode || 400,
      body: err.message || JSON.stringify(err.message)
    }
  }
}
