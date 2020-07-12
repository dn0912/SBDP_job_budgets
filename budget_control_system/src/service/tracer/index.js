import AWS from 'aws-sdk'

const credentials = new AWS.SharedIniFileCredentials({ profile: process.env.AWS_PROFILE })
AWS.config.credentials = credentials
AWS.config.update({
  region: process.env.AWS_RESOURCE_REGION,
})

const XRay = new AWS.XRay()

export default class Tracer {
  constructor() {
    this.xray = XRay
  }

  // startTracing() {}

  async getXRayTraces(traceIds) {
    console.log('+++xray', this.xray)
    const param = {
      TraceIds: traceIds,
    }
    const traceData = await this.xray.batchGetTraces(param).promise()

    return traceData
  }

  async getXRayTraceSummaries(startTime, endTime) {
    console.log('+++getXRayTraceSummaries', { startTime, endTime })
    const param = {
      StartTime: startTime,
      EndTime: endTime,
    }

    const traceData = await this.xray.getTraceSummaries(param).promise()
    return traceData
  }

  async getXRayServiceGraph(startTime, endTime) {
    console.log('+++getXRayServiceGraph', { startTime, endTime })
    const param = {
      StartTime: startTime,
      EndTime: endTime,
    }
    const traceData = await this.xray.getServiceGraph(param).promise()
    return traceData
  }

  async batchGetXrayTraces(traceIds) {
    console.log('+++bachGetXrayTraces', { traceIds })
    const param = {
      TraceIds: traceIds
    }
    const traceData = await this.xray.batchGetTraces(param).promise()
    return traceData
  }
}
