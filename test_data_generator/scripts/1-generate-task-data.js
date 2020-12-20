import { range } from 'lodash'
import moment from 'moment'
import fs from 'fs'
import uuid from 'node-uuid'
import { ArgumentParser } from 'argparse'

const randomStringGenerator = (prefix) => {
  // e.g. T123456
  const idChars = '1234567890'
  const randomString = range(6).reduce(
    acc => acc + idChars[Math.floor(Math.random() * 10)],
    `${prefix}`)

  return randomString
}

const generateRandomContextSet = (
  teamsAmount,
  channelsPerTeamAmount,
  usersPerTeamAmount,
) => {
  /*
   example: Permutation of channel with users
   Team1 with 2 channels and each channel 3 users
   Team4 with 5 channels and each channel 6 users
   Team7 with 8 channels and each channel 9 users
    [
      { teamId: T1, channelId: C1, userId: U1 },
      { teamId: T1, channelId: C2, userId: U1 },
      { teamId: T1, channelId: C1, userId: U2 },
      { teamId: T1, channelId: C2, userId: U2 },
      { teamId: T1, channelId: C1, userId: U3 },
      { teamId: T1, channelId: C2, userId: U3 },
    ]
  */

  const teamsArray = []
  const channelsArray = []
  const usersArray = []
  let uniqueEntitySet = new Set()

  const createUniqueId = (prefix) => {
    let randomId
    do {
      randomId = randomStringGenerator(prefix)
    } while (uniqueEntitySet.has(randomId))
    uniqueEntitySet.add(randomId)
    return randomId
  }

  for (let team = 0; team < teamsAmount; team++) {
    const randomTeamId = createUniqueId('Team-')
    teamsArray.push(randomTeamId)
  }

  for (let channel = 0; channel < channelsPerTeamAmount; channel++) {
    const randomChannelId = createUniqueId('Channel-')
    channelsArray.push(randomChannelId)
  }

  for (let user = 0; user < usersPerTeamAmount; user++) {
    const randomUserId = createUniqueId('User-')
    usersArray.push(randomUserId)
  }

  const context_set_array = []
  teamsArray.forEach(teamId => {
    channelsArray.forEach(channelId => {
      usersArray.forEach(userId => {
        context_set_array.push({
          teamId,
          channelId,
          userId,
        })
      })
    })
  })

  return context_set_array
}

const CONTEXT_SET = {
  teamId: 'T123',
  channelId: 'C123',
  userId: 'U123',
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
  description: "this is a description of a task",
  labels: [],
  humanTaskId: null,
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

const getRandomAdditionMilliSecTime = (min, max) => {
  return Math.floor(Math.random() * (max - min) + min)
}

const updateTaskStatus = (task, status) => ({
  ...task,
  statusId: status,
  updateDate: task.updateDate + getRandomAdditionMilliSecTime(1000 * 60 * 60 * 4, 1000*60*60*12), // between 4 - 12 hours
})

const updateTaskDetails = (task, updatePayload) => ({
  ...task,
  ...updatePayload,
  updateDate: task.updateDate + getRandomAdditionMilliSecTime(1000 * 60 * 5, 1000 * 60 * 60 * 6), // between 5min - 6h
})

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
  "eventName": "MODIFY"
})

const main = () => {
  const parser = new ArgumentParser({
    add_help: true,
    description: 'Generate test data for serverless big data processing - Context: Task update data of a productivity app in Kanban context',
  })

  parser.add_argument(
    '-n', '--number',
    {
      help: 'The amount of tasks for to generate task update data.',
      required: true,
    },
  )

  const args = parser.parse_args()

  const taskEvents = []
  const randomContextSet = [CONTEXT_SET]
  const taskAmount = Number(args.number)

  if (isNaN(taskAmount)) {
    throw new Error('Argument is not a number!')
  }

  randomContextSet.forEach(contextSet => {
    for (let i = 0; i < taskAmount; i++) {
      const newTask = createTask(contextSet)
      const taskInProgress = updateTaskStatus(newTask, STATUS_ARRAY[1])
      const taskCompleted = updateTaskStatus(newTask, STATUS_ARRAY[2])

      // 1. create task event
      taskEvents.push(createEvent(newTask))

      // updating task details
      const updatedDescriptionNewTask = updateTaskDetails(newTask, { description: 'has changed' })
      taskEvents.push(createEvent(updatedDescriptionNewTask, newTask))

      // 2. from created/planned status to in progress
      taskEvents.push(createEvent(taskInProgress, updatedDescriptionNewTask))

      // updating task details again
      const updatedTitleInProgressTask = updateTaskDetails(taskInProgress, { title: 'title has changed' })
      taskEvents.push(createEvent(updatedTitleInProgressTask, taskInProgress))

      // 3. from in progress to completed
      taskEvents.push(createEvent(taskCompleted, updatedTitleInProgressTask))
    }
  })

  console.log(JSON.stringify(taskEvents))
}

main()
