'use strict'

const AWSXRay = require('aws-xray-sdk-core')
const AWS = AWSXRay.captureAWS(require('aws-sdk'))

const moment = require('moment')

// AWS.SQS.prototype.sendTracedMessage = async function(payload, jobId) {
AWS.SQS.prototype.sendTracedMessage = function(payload, jobId, callback) {
  console.log('+++sendTracedMessage', jobId)

  // const result = await this.sendMessage(payload).promise()
  // const result = this.sendMessage(payload, callback)

  // console.log('+++resulst', result)
  // return result
  return this.sendMessage(payload, callback)
}

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
  console.log('+++sendTracedMessage', jobId)
  sqsPayloadSizeTracer(sqsPayload, jobId)
  return this.sendMessage(sqsPayload, callback)
}

AWS.SQS.prototype.helloWorldDuc = function () {
  console.log('+++hello world Duc')
}

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

// class DucSQS extends AWS.SQS {
//   sendDucTracedMessage(payload, jobId, callback) {
//     console.log('extended one HELLO WORLD', jobId)

//     this.sendMessage(payload, callback)
//   }

//   sendMessage(payload, callback) {
//     console.log('original sendMessage')
//     super.sendMessage(payload, callback)
//   }
// }

// AWS.DucSQS = DucSQS
module.exports = AWS
