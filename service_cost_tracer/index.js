'use strict'

const AWSXRay = require('aws-xray-sdk-core')
const AWS = AWSXRay.captureAWS(require('aws-sdk'))

const moment = require('moment')

// SQS
const sqsPayloadSizeTracer = function (sqsPayload, jobId) {
  const { QueueUrl } = sqsPayload
  console.log('+++sqsPayload', sqsPayload)
  console.log('+++sqsPayload111', JSON.stringify(sqsPayload))
  // TODO: Blob is somehow not working
  // const payloadByteSize = new Blob([JSON.stringify(sqsPayload)]).size
  const payloadByteSize = Buffer.byteLength(JSON.stringify(sqsPayload), 'utf8');
  const sqs64KiloByteChunkAmounts = Math.ceil(payloadByteSize / 1024 / 64)

  const segment = AWSXRay.getSegment()
  const subsegment = segment.addNewSubsegment('Cost tracer subsegment - SQS: SQS payload size')
  subsegment.addAnnotation('sqsMessagePayloadSizeInKiloBytes', payloadByteSize / 1024) // TODO: maybe not really necessary => only chunksize
  subsegment.addAnnotation('sqsMessageChunkAmounts', sqs64KiloByteChunkAmounts)
  subsegment.addAnnotation('queueUrl', QueueUrl)
  subsegment.addAnnotation('jobId', jobId)
  subsegment.addAnnotation('serviceType', 'SQS')
  subsegment.close()
}

AWS.SQS.prototype.tracedSendMessage = function (sqsPayload, jobId, callback) {
  console.log('+++tracedSendMessage', jobId)
  sqsPayloadSizeTracer(sqsPayload, jobId)
  return this.sendMessage(sqsPayload, callback)
}

AWS.SQS.prototype.helloWorldDuc = function () {
  console.log('+++hello world Duc')
}

// Lambda
AWS.startLambdaTracer = function (context, jobId) {
  console.log('+++Start tracing - preprocesser')
  const segment = AWSXRay.getSegment()
  console.log('+++jobId', jobId)
  console.log('+++segment', segment)
  const subsegment = segment.addNewSubsegment('Cost tracer subsegment - Lambda: preprocessor')
  subsegment.addAnnotation('jobId', jobId)
  subsegment.addAnnotation('serviceType', 'AWSLambda')
  subsegment.addAnnotation('memoryAllocationInMB', context.memoryLimitInMB)
  console.log('+++subsegment', subsegment)

  return subsegment
}

AWS.stopLambdaTracer = function (lambdaSubsegment) {
  const timeStamp = moment.utc().valueOf()
  lambdaSubsegment.addAnnotation('currentTimeStamp', timeStamp)
  lambdaSubsegment.close()
}

// S3
const s3FileSizeTracer = function (fileContent, jobId) {
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

AWS.S3.prototype.tracedPutObject = function (params, jobId, callback) {
  const fileContent = params.Body
  s3FileSizeTracer(fileContent, jobId)
  return this.putObject(params, callback)
}

// AWS.DucSQS = DucSQS
module.exports = AWS
