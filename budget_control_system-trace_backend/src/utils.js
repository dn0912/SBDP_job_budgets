import { get } from 'lodash'
import moment from 'moment'
import fs from 'fs'

// X-Ray tracing approach specific code to evaluate speed - measure trace fetching delay
async function fetchTracePeriodically(xRayTracer, dateNow, jobId) {
  const pollPeriodinMs = 200
  const counter = {
    value: 0,
  }

  // delay it for 1 sec
  await new Promise((resolve) => setTimeout(() => {
    console.log('#### wait for 1 sec')
    resolve()
  }, 1000))
  while (counter.value < 30) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, pollPeriodinMs))
    const startTime = dateNow / 1000
    const endTime = Date.now() / 1000
    // eslint-disable-next-line no-await-in-loop
    const traceSummary = await xRayTracer.getXRayTraceSummaries(startTime, endTime, jobId)

    const traceCloseTimeStampAnnotation = get(traceSummary, 'TraceSummaries[0].Annotations.currentTimeStamp[0].AnnotationValue.NumberValue', undefined)

    console.log('>>> traceCloseTimeStampAnnotation', traceCloseTimeStampAnnotation)

    const currentTimeStamp = moment.utc().valueOf()
    console.log('>>> currentTimeStamp', currentTimeStamp)

    const traceResult = {
      jobStartTimeStamp: dateNow,
      arn: get(traceSummary, 'TraceSummaries[0].ResourceARNs[0].ARN', undefined),
      traceCloseTimeStamp: traceCloseTimeStampAnnotation,
      currentTimeStamp,
      elapsedTimeFromClosingTraceToNow: currentTimeStamp - traceCloseTimeStampAnnotation,
    }

    console.log('>>> traceSummary.TraceSummaries', traceSummary.TraceSummaries)

    counter.value++
    if (traceSummary.TraceSummaries.length > 0) {
      // this break statement will stop fetching records after first X-Ray trace arrives
      console.log('>>> traceSummaryArray', traceResult, { pollPeriodinMs })
      fs.appendFileSync(
        'evaluation/traceFetchingDelays.csv',
        `\n${traceResult.jobStartTimeStamp}, ${traceResult.arn}, ${traceResult.traceCloseTimeStamp}, ${traceResult.currentTimeStamp}, ${traceResult.elapsedTimeFromClosingTraceToNow}`,
      )
      break
    }
  }
}

export default {
  fetchTracePeriodically,
}
