const { BUCKET, FILE, SUBRESULT_FOLDER, REGION, QUEUE_NAME } = process.env

const AWSXRay = require('aws-xray-sdk-core')
const AWS = AWSXRay.captureAWS(require('aws-sdk'))
const moment = require('moment')
const s3 = new AWS.S3()
const sqs = new AWS.SQS({
  region: REGION,
})

const { promisify } = require('util')

const getS3Object = promisify(s3.getObject).bind(s3)
const putS3Object = promisify(s3.putObject).bind(s3)
const sendSQSMessage = promisify(sqs.sendMessage).bind(sqs)

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

const _putFile = async (fileContent) => {
  const currentmTimeStamp = moment().valueOf()
  const fileName = `${currentmTimeStamp}_processedUpdates.json`
  await putS3Object({
    Bucket: BUCKET,
    Key: `${SUBRESULT_FOLDER}/${fileName}`,
    Body: JSON.stringify(fileContent),
  })

  return fileName
}

// TODO:
const _filterUnnecessaryUpdates = (tasksUpdateArray) => {
  const filteredTaskUpdateArray = tasksUpdateArray.filter(updateEntry =>
    updateEntry['OldImage']['statusId'] !== updateEntry['NewImage']['statusId'])
  
  return filteredTaskUpdateArray
}

const startLambdaTracing = (jobId = 'dummyId') => {
  console.log('+++Start tracing - preprocesser')
  const segment = AWSXRay.getSegment()
  console.log('+++jobId', jobId)
  console.log('+++segment', segment)
  const subsegment = segment.addNewSubsegment('preprocessor subsegment')
  subsegment.addAnnotation('jobId', jobId)
  subsegment.addAnnotation('serviceType', 'AWSLambda')
  console.log('+++subsegment', subsegment)

  return subsegment
}

module.exports.readAndFilterFile = async (event, context) => {
  console.log('+++event', JSON.stringify(event, undefined, 2))
  console.log('+++context', context)
  try {
    // *******
    // Tracing
    const lambdaTracingSubsegment = startLambdaTracing(event.jobId)
    // *******

    const inputFileName = (event && event.fileName) || FILE
    const s3FileContentAsString = await _readFile(inputFileName)
    const s3FileContent = JSON.parse(s3FileContentAsString)
    const cleanTaskUpdates = _filterUnnecessaryUpdates(s3FileContent)
    const fileName = await _putFile(cleanTaskUpdates)

    console.log('+++fileName', fileName)

    const accountId = context.invokedFunctionArn.split(":")[4]
    const queueUrl = `https://sqs.${REGION}.amazonaws.com/${accountId}/${QUEUE_NAME}`

    const sqsPayload = {
      MessageBody: fileName,
      QueueUrl: queueUrl,
    }

    // Sends single message to SQS for further process
    const test = await sendSQSMessage(sqsPayload)

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

    // *******
    // TRACING
    lambdaTracingSubsegment.close()
    // *******

    return response
  } catch (err) {
    return {
      statusCode: err.statusCode || 400,
      body: err.message || JSON.stringify(err.message)
    }
  }
}
