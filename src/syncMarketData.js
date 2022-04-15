const Sentry = require('@sentry/node')

// Enable Sentry (for production only)
if (process.env.NODE_ENV === 'production') {
  Sentry.init({
    dsn: process.env.SENTRY_DSN
  })
}

const syncMarketData = require('./syncMarketData')

const mongo = require('./utils/mongo')

mongo.connect()

async function start() {
  console.log('worker', JSON.stringify(syncMarketData))
  await syncMarketData.start()
}

function stop(signal) {
  return async function () {
    console.log('Received', signal)

    await syncMarketData.stop()
    await mongo.disconnect()
    process.exit(0)
  }
}

switch (process.env.PROCESS_TYPE) {
  case 'migrate':
    require('./migrate').run()
    break

  default: {
    start()

    process.on('SIGTERM', stop('SIGTERM'))
    process.on('SIGINT', stop('SIGINT'))

    break
  }
}
