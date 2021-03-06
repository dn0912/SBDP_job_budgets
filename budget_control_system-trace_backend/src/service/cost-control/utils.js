import { get, set, flatten } from 'lodash'

const _parceFullTraceIntoServiceTraceSegments = (subsegmentName, fullTrace) =>
  fullTrace
    .filter((seg) => seg.Document.includes(subsegmentName))
    .map((seg) => ({
      ...seg,
      Document: JSON.parse(seg.Document),
    }))

const _parceServiceTraceSegmentsIntoSubsegments = (subsegmentName, serviceTraceSegments) =>
  flatten(serviceTraceSegments.map((document) => {
    const { subsegments } = get(document, 'Document.subsegments', [])
      .find((subsegment) => subsegment.name === 'Invocation')

    const sqsSubsegment = subsegments
      .filter((subsegment) => subsegment.name.includes(subsegmentName))
    return sqsSubsegment
  }))

const calculateLambdaProcessingTimes = (fullTraceSegments) => {
  const lambdaTraceSegments = _parceFullTraceIntoServiceTraceSegments(
    'Cost tracer subsegment - Lambda',
    fullTraceSegments,
  )

  const lambdaSubsegments = _parceServiceTraceSegmentsIntoSubsegments(
    'Cost tracer subsegment - Lambda',
    lambdaTraceSegments,
  )

  const lambdaProcessingDurationWithMemoryAllocInMB = lambdaSubsegments
    .reduce((acc, subSeg, index) => {
      const lambdaTraceSegmentDoc = lambdaTraceSegments[index].Document
      acc.push({
        processingTime: lambdaTraceSegmentDoc.end_time - lambdaTraceSegmentDoc.start_time,
        memoryAllocationInMB: subSeg.annotations.memoryAllocationInMB,
      })
      return acc
    }, [])

  return lambdaProcessingDurationWithMemoryAllocInMB
}

const calculateSqsRequestAmountsPerQueue = (fullTraceSegments) => {
  const sqsTraceSegments = _parceFullTraceIntoServiceTraceSegments(
    'Cost tracer subsegment - SQS',
    fullTraceSegments,
  )

  const sqsSubsegments = _parceServiceTraceSegmentsIntoSubsegments(
    'Cost tracer subsegment - SQS: SQS payload size',
    sqsTraceSegments,
  )

  const sqsRequestAmounts = sqsSubsegments.reduce((acc, seg) => {
    const { queueUrl } = seg.annotations
    const previousTracedValue = get(acc, `["${queueUrl}"].SendMessage`, 0)
    const tracedQueueData = {
      SendMessage: previousTracedValue + 1,
      QueueType: 'standard'
    }
    set(acc, `["${queueUrl}"]`, tracedQueueData)
    return acc
  }, {})

  return sqsRequestAmounts
}

const calculateS3ContentSizeInGB = (fullTraceSegments) => {
  const s3TraceSegments = _parceFullTraceIntoServiceTraceSegments('Cost tracer subsegment - S3', fullTraceSegments)

  const s3Subsegments = _parceServiceTraceSegmentsIntoSubsegments(
    'Cost tracer subsegment - S3: S3 file size',
    s3TraceSegments,
  )

  const totalS3ContentSizeInKiloByte = s3Subsegments.reduce((acc, subSeq) =>
    acc + subSeq.annotations.s3ContentKiloByteSize, 0)

  return totalS3ContentSizeInKiloByte / 1024 ** 2 // convert from KB into GB
}

const calculateS3ContentSizeInGBFromRedis = (S3FileSizeTrace) => {
  const totalS3ContentSizeInKiloByte = S3FileSizeTrace.reduce((acc, val) => acc + Number(val), 0)

  return totalS3ContentSizeInKiloByte / 1024 ** 2 // convert from KB into GB
}

const TRACED_SERVICES = ['S3', 'SQS']
const createServiceTracingMap = (fullTraceSegments) => {
  const filteredServiceTraceList = fullTraceSegments
    .map((seg) => ({
      ...seg,
      Document: JSON.parse(seg.Document),
    }))
    .filter((seg) => TRACED_SERVICES.includes(seg.Document.name))

  const tracingMapWithoutLambdas = filteredServiceTraceList
    .reduce((acc, segment) => {
      const serviceName = segment.Document.name
      const serviceOperation = segment.Document.aws.operation
      const objectPath = `${serviceName}.${serviceOperation}`

      const previousTracedValue = get(acc, objectPath, 0)
      set(acc, objectPath, previousTracedValue + 1)
      /* Object structure:
      {
        S3: {
          GetObject: 2,
          PutObject: 2,
        },
        SQS: {
          SendMessage: 2,
        }
      }
    */
      return acc
    }, {})

  return tracingMapWithoutLambdas
}

export {
  calculateLambdaProcessingTimes,
  createServiceTracingMap,
  calculateSqsRequestAmountsPerQueue,
  calculateS3ContentSizeInGB,
  calculateS3ContentSizeInGBFromRedis,
}
