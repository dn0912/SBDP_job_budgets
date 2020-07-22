import { get, set, flatten } from 'lodash'

const serialize = (object) => JSON.stringify(object, null, 2)

const calculateLambdaProcessingTimes = (fullTraceSegments) => {
  const lambdaTraceSegments = fullTraceSegments
    .filter((seg) => seg.Document.includes('Cost tracer subsegment - Lambda'))
    .map((seg) => ({
      ...seg,
      Document: JSON.parse(seg.Document),
    }))
  const lambdaProcessingTimes = lambdaTraceSegments.map(
    (lambdaTrace) => lambdaTrace.Document.end_time - lambdaTrace.Document.start_time
  )
  console.log('+++lambdaTraceSegments', lambdaTraceSegments)
  console.log('+++lambdaProcessingTimes', lambdaProcessingTimes)

  return lambdaProcessingTimes
}

const calculateSqsRequestAmountsPerQueue = (fullTraceSegments) => {
  const sqsTraceSegments = fullTraceSegments
    .filter((seg) => seg.Document.includes('Cost tracer subsegment - SQS'))
    .map((seg) => ({
      ...seg,
      Document: JSON.parse(seg.Document),
    }))

  const sqsSubsegments = flatten(sqsTraceSegments.map((document) => {
    // const lambdaInvocationSubsegmentWithSqsAnnotation =
    const { subsegments } = get(document, 'Document.subsegments', [])
      .find((subsegment) => subsegment.name === 'Invocation')

    const sqsSubsegment = subsegments
      .filter((subsegment) => subsegment.name.includes('Cost tracer subsegment - SQS: SQS payload size'))
    return sqsSubsegment
  }))

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

  // console.log('+++sqsSubsegments', serialize(sqsSubsegments), sqsRequestAmounts)

  return sqsRequestAmounts
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
}
