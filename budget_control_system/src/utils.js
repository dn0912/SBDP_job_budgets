import { get, set } from 'lodash'

const TRACED_SERVICES = ['S3', 'SQS']

const calculateLambdaProcessingTimes = (traceSegments) => {
  const lambdaTraceSegments = traceSegments
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

const createServiceTracingMap = (traceSegments) => {
  const filteredServiceTraceList = traceSegments
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
}
