import moment from 'moment'
import fs from 'fs'
import uuid from 'node-uuid'

const CONTEXT_SET = {
  userId: 'U123',
  teamId: 'T123',
  channelId: 'C123',
}


const STATUS_ARRAY = ['planned', 'progress', 'completed']

const taskTemplate = {
  _meta: {
    version: {
      updateDate: 1577837157853,
      statusId: 'status-id-123',
      stepId: 'step-id-123',
    },
  },
  priority: 1577724550781,
  title: "dummy test task title",
  description: "this is a description of a tast",
  labels: [],
  humanTaskId: null,
  // taskId: "task-id-123",
}

const createTask = (CONTEXT_SET) => {
  const { userId, teamId, channelId } = CONTEXT_SET
  const timeStamp = Date.now()

  return {
    ...taskTemplate,
    teamId,
    channelId,
    createDate: timeStamp,
    updateDate: timeStamp,
    createdBy: userId,
    updatedBy: userId,
    streamId: `${teamId}-${channelId}`,
    assignee: userId,
    statusId: STATUS_ARRAY[0],
    taskId: uuid.v4(),
  }
}

const updateTaskStatus = (task, status) => ({
  ...task,
  statusId: status,
  updateDate: task.updateDate + 50400000, // + 14 hours
})

const main = () => {
  const createEvent = (newTask, oldTask = {}) => ({
    Keys: {
      taskId: newTask.taskId,
    },
    NewImage: {
      ...newTask,
    },
    OldImage: {
      ...oldTask,
    },
    "SequenceNumber": "5698991600000000006845103024",
    "SizeBytes": 679,
    "ApproximateCreationDateTime": 1577837157,
    "eventName": "MODIFY" //TODO check creation eventname
  })

  const taskEvents = []

  // for (let i = 0; i < 100000; i++) {
  for (let i = 0; i < 100; i++) {
    const newTask = createTask(CONTEXT_SET)
    const taskInProgress = updateTaskStatus(newTask, STATUS_ARRAY[1])
    const taskCompleted = updateTaskStatus(newTask, STATUS_ARRAY[2])

    taskEvents.push(
      createEvent(newTask),
      createEvent(taskInProgress, newTask),
      createEvent(taskCompleted, taskInProgress)
    )
  }

  console.log(JSON.stringify(taskEvents))
}

main()
