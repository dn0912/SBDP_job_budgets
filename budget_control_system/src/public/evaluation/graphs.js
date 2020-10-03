// Plotly.d3.csv("https://raw.githubusercontent.com/plotly/datasets/master/violin_data.csv", function (err, rows) {

const unpack = (rows, key) => {
  // console.log('rows', rows)
  return rows.map((row) => parseInt(row[key].trim(), 10))
}

// eslint-disable-next-line no-undef
Plotly.d3.csv('http://localhost:8080/evaluation/trace-fetching-delay/traceFetchingDelaysRedis_log-local.csv', (err, rows) => {
  const unpackedData = unpack(rows, 'passedTime')

  const data = [{
    type: 'violin',
    y: unpackedData,
    points: 'none',
    box: {
      visible: true
    },
    boxpoints: false,
    line: {
      color: 'black'
    },
    fillcolor: '#8dd3c7',
    opacity: 0.6,
    meanline: {
      visible: true
    },
    x0: 'Delay (ms)'
  }]

  const layout = {
    title: 'Delay of fetching data with local trace-backend',
    yaxis: {
      zeroline: false
    },
    autosize: false,
    width: 550,
    height: 550,
    margin: {
      l: 50,
      r: 50,
      b: 100,
      t: 100,
      pad: 4
    },
    // paper_bgcolor: '#7f7f7f',
    // plot_bgcolor: '#c7c7c7'
  }

  // eslint-disable-next-line no-undef
  Plotly.newPlot('myDiv', data, layout)
})

// eslint-disable-next-line no-undef
Plotly.d3.csv(
  'http://localhost:8080/evaluation/trace-fetching-delay/traceFetchingDelaysRedis_log-deployed_trace_backend.csv',
  (err, rows) => {
    const unpackedData = unpack(rows, 'passedTime')

    const data2 = [{
      type: 'violin',
      y: unpackedData,
      points: 'none',
      box: {
        visible: true
      },
      boxpoints: false,
      line: {
        color: 'black'
      },
      fillcolor: '#8dd3c7',
      opacity: 0.6,
      meanline: {
        visible: true
      },
      x0: 'Delay (ms)'
    }]

    const layout2 = {
      title: 'Delay of fetching data with deployed trace-backend',
      yaxis: {
        zeroline: false
      },
      autosize: false,
      width: 550,
      height: 550,
      margin: {
        l: 50,
        r: 50,
        b: 100,
        t: 100,
        pad: 4
      },
      // paper_bgcolor: '#7f7f7f',
      // plot_bgcolor: '#c7c7c7'
    }

    // eslint-disable-next-line no-undef
    Plotly.newPlot('myDiv2', data2, layout2)
  }
)

// eslint-disable-next-line no-undef
Plotly.d3.csv('http://localhost:8080/evaluation/trace-fetching-delay/traceFetchingDelaysRedis_log-local.csv', (err, localDataRows) => {
  // eslint-disable-next-line no-undef
  Plotly.d3.csv('http://localhost:8080/evaluation/trace-fetching-delay/traceFetchingDelaysRedis_log-deployed_trace_backend.csv', (err, deployedTraceBackendRows) => {
    const unpackedLocalData = unpack(localDataRows, 'passedTime')
    const unpackedDeployedTraceBackendData = unpack(deployedTraceBackendRows, 'passedTime')

    // const xValues = localDataRows.map(() => 'Delay (ms)')

    const _unpack = (rows, key) => {
      console.log('rows', rows)
      return rows.map((row) => `${row[key].trim()} lambdas`)
    }

    const data = [{
      type: 'violin',
      x: _unpack(deployedTraceBackendRows, 'parallelLambdas'),
      y: unpackedLocalData,
      legendgroup: 'local BE',
      scalegroup: 'local BE',
      name: 'local BE',
      side: 'negative',
      box: {
        visible: true
      },
      line: {
        color: 'blue',
        width: 2
      },
      meanline: {
        visible: true
      }
    },
    {
      type: 'violin',
      x: _unpack(localDataRows, 'parallelLambdas'),
      y: unpackedDeployedTraceBackendData,
      legendgroup: 'deployed BE',
      scalegroup: 'deployed BE',
      name: 'deployed BE',
      side: 'positive',
      box: {
        visible: true
      },
      line: {
        color: 'green',
        width: 2
      },
      meanline: {
        visible: true
      }
    }]

    const layout = {
      title: 'Split local and deployed trace-backend',
      yaxis: {
        zeroline: false,
      },
      violingap: 0,
      violingroupgap: 0,
      violinmode: 'overlay',
      width: 1000,
      height: 550,
    }

    // eslint-disable-next-line no-undef
    Plotly.newPlot('myDiv3', data, layout)
  })
})

/**
 * lambda processing time accuracy
 */
// eslint-disable-next-line no-undef
Plotly.d3.csv(
  'http://localhost:8080/evaluation/lambda-processing-time-accuracy/parrallel_lambdas-lambdaProcessingTimeAccuracy_cw.csv',
  (err, cwRows) => {
    // eslint-disable-next-line no-undef
    Plotly.d3.csv(
      'http://localhost:8080/evaluation/lambda-processing-time-accuracy/parrallel_lambdas-lambdaProcessingTimeAccuracy_tracer.csv',
      (err, tracerRows) => {
        console.log('+++cwRows', cwRows)
        console.log('+++tracerRows', tracerRows)
        const cloudWatchMap = cwRows.reduce((acc, value) => {
          return {
            ...acc,
            [value.RequestID]: value,
          }
        }, {})

        const tracerMap = tracerRows.reduce((acc, value) => {
          return {
            ...acc,
            [value.RequestID]: value,
          }
        }, {})

        const deltas = tracerRows.map((lambdaTrace) => {
          const { requestId } = lambdaTrace

          const lambdaDurationInMSSec = parseInt(lambdaTrace.processingTime * 1000, 10)
          const billedDuration = Math.ceil(lambdaDurationInMSSec / 100) * 100

          const cwLambdaBilledDurationIn100Ms = parseInt(cloudWatchMap[requestId].BilledDurationInMS, 10)
          const cwLambdaDurationInMs = parseInt(cloudWatchMap[requestId].DurationInMS, 10)

          return {
            requestId,
            budgetTool_tracedlambdaDurationInMSSec: lambdaDurationInMSSec,
            budgetTool_billedDuration: billedDuration,
            cw_LambdaDurationInMs: cwLambdaDurationInMs,
            cw_LambdaBilledDurationIn100Ms: cwLambdaBilledDurationIn100Ms,
            deltaBilledDuration: cwLambdaBilledDurationIn100Ms - billedDuration,
            deltaDuration: cwLambdaDurationInMs - lambdaDurationInMSSec,
          }
        })

        console.log('+++deltas', deltas)
        const traceDeltaIn100MsSegments = {
          x: deltas.map((val, index) => index),
          y: deltas.map((val) => val.deltaBilledDuration),
          mode: 'scatter',
          name: 'Billed difference',
        }
        const traceDeltaInMs = {
          x: deltas.map((val, index) => index),
          y: deltas.map((val) => val.deltaDuration),
          mode: 'scatter',
          name: 'Measured difference',
        }
        // eslint-disable-next-line no-undef
        Plotly.newPlot(
          'myDivBilledDiff',
          [traceDeltaIn100MsSegments],
          {
            title: 'Difference on measured lambda billed processing duration from trace backend and CloudWatch logs',
            width: 1000,
            height: 550,
          },
        )
        // eslint-disable-next-line no-undef
        Plotly.newPlot(
          'myDiv4',
          [traceDeltaInMs],
          {
            title: 'Difference on measured lambda execution time from tracing backend compared to CloudWatch logs',
            width: 1000,
            height: 550,
            xaxis: { title: 'execution index' },
            yaxis: { title: 'time in ms' },
          },
        )

        const mergedCWAndTracerData = tracerRows.map((tracerVal) => {
          return {
            cwDuration: cloudWatchMap[tracerVal.requestId].DurationInMS,
            tracerDuration: tracerVal.processingTime * 1000,
          }
        })

        const cWDuration = {
          x: cwRows.map((val, index) => index),
          y: cwRows.map((val) => val.DurationInMS),
          mode: 'scatter'
        }

        const traceTracerDuration = {
          x: tracerRows.map((val, index) => index),
          y: tracerRows.map((val) => val.processingTime * 1000),
          mode: 'scatter'
        }

        const data2 = [cWDuration, traceTracerDuration]
        const data3 = [
          {
            x: mergedCWAndTracerData.map((val, index) => index),
            y: mergedCWAndTracerData.map((val) => val.cwDuration),
            name: 'CloudWatch measured lambda duration',
          },
          {
            x: mergedCWAndTracerData.map((val, index) => index),
            y: mergedCWAndTracerData.map((val) => val.tracerDuration),
            name: 'Traced lambda duration',
          },
        ]
        // eslint-disable-next-line no-undef
        Plotly.newPlot('myDiv5', data3, {
          width: 1000,
          height: 550,
        })

        // const data4 = [{
        //   opacity: 0.5,
        //   type: 'histogram',
        //   x: mergedCWAndTracerData.map((val, index) => index),
        //   y: mergedCWAndTracerData.map((val) => val.cwDuration),
        //   name: 'CloudWatch measured lambda duration',
        //   marker: {
        //     color: 'green',
        //   },
        // },
        // {
        //   opacity: 0.5,
        //   type: 'histogram',
        //   x: mergedCWAndTracerData.map((val, index) => index),
        //   y: mergedCWAndTracerData.map((val) => val.tracerDuration),
        //   name: 'Traced lambda duration',
        //   marker: {
        //     color: 'red',
        //   },
        // }]
        // const layout = {
        //   bargap: 0.05,
        //   bargroupgap: 0.2,
        //   barmode: 'overlay',
        //   // title: 'Sampled Results',
        //   // xaxis: { title: 'Value' },
        //   // yaxis: { title: 'Count' }
        //   width: 1000,
        //   height: 550,
        // }
        // // eslint-disable-next-line no-undef
        // Plotly.newPlot('myDiv6', data4, layout)
      }
    )
  }
)
