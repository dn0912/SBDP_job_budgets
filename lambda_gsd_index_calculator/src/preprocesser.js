const { BUCKET, FILE, SUBRESULT_FOLDER, REGION, QUEUE_NAME } = process.env

const AWSXRay = require('aws-xray-sdk-core')
const AWS = AWSXRay.captureAWS(require('aws-sdk'))
const TracedAWS = require('service-cost-tracer')

const moment = require('moment')
const s3 = new TracedAWS.S3()

const tracedSQS = new TracedAWS.SQS({
  region: REGION,
})

const { promisify } = require('util')

const getS3Object = promisify(s3.getObject).bind(s3)
const putS3Object = promisify(s3.putObject).bind(s3)
const tracedSendSQSMessage = promisify(tracedSQS.tracedSendMessage).bind(tracedSQS)

// TODO: remove later
// simulate slow function
const _slowDown = async (ms) => {
  console.log('+++Take it easy!?!')
  await new Promise(resolve => setTimeout(resolve, ms))
}

// *******
// TRACING

const s3FileSizeTracer = (jobId, fileContent) => {
  const contentByteSize = Buffer.byteLength(JSON.stringify(fileContent), 'utf8');
  const s3ContentKiloByteSize = contentByteSize / 1024

  console.log('+++jobId', jobId)
  console.log('+++s3ContentKiloByteSize', s3ContentKiloByteSize)

  const segment = AWSXRay.getSegment()
  const subsegment = segment.addNewSubsegment('Cost tracer subsegment - S3: S3 file size')
  subsegment.addAnnotation('s3ContentKiloByteSize', s3ContentKiloByteSize)
  subsegment.addAnnotation('jobId', jobId)
  subsegment.addAnnotation('serviceType', 'S3')
  subsegment.close()
}
// TRACING
// *******

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

module.exports.readAndFilterFile = async (event, context) => {
  console.log('+++event', JSON.stringify(event, undefined, 2))
  console.log('+++context', context)
  try {
    // *******
    // Tracing
    const jobId = event.jobId
    // const lambdaSubsegment = startLambdaTracing(jobId, context)
    const lambdaSubsegment = TracedAWS.startLambdaTracer(context, jobId)
    // *******

    const inputFileName = (event && event.fileName) || FILE
    const s3FileContentAsString = await _readFile(inputFileName)
    const s3FileContent = JSON.parse(s3FileContentAsString)
    const cleanTaskUpdates = _filterUnnecessaryUpdates(s3FileContent)
    // *******
    // Tracing
    s3FileSizeTracer(jobId, cleanTaskUpdates)
    // *******
    const fileName = await _putFile(cleanTaskUpdates)

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
    const test = await tracedSendSQSMessage(sqsPayload, jobId)

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
    TracedAWS.stopLambdaTracer(lambdaSubsegment)
    // *******

    return response
  } catch (err) {
    return {
      statusCode: err.statusCode || 400,
      body: err.message || JSON.stringify(err.message)
    }
  }
}
