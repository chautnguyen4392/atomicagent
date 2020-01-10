const fs = require('fs')
const path = require('path')
const debug = require('debug')('liquality:agent:worker')

const mongoose = require('mongoose')
const Agenda = require('agenda')

const JOBS_DIR = path.join(__dirname, 'jobs')

let agenda

module.exports.start = async () => {
  agenda = new Agenda({ mongo: mongoose.connection })

  fs.readdirSync(JOBS_DIR)
    .forEach(jobSlug => {
      const jobName = path.basename(jobSlug, '.js')

      agenda.define(jobName, async (job, done) => {
        const fn = require(path.join(JOBS_DIR, jobSlug))(agenda)

        fn(job)
          .then(() => done())
          .catch(e => done(e))
      })
    })

  agenda.on('fail', async (err, job) => {
    if (err) {}

    if (job.attrs.failCount <= 5) {
      debug('Retrying', job.attrs)

      if (process.env.NODE_ENV === 'test') {
        job.schedule('in 2 seconds')
      } else {
        job.schedule('in 15 seconds')
      }

      await job.save()
    } else {
      debug('Max attempts reached. Job has failed', job.attrs)
    }
  })

  await agenda.start()
  await agenda.every('5 minutes', 'update-market-data')
}

module.exports.stop = () => {
  if (agenda) {
    agenda.stop().then(() => process.exit(0))
  }
}

process.on('SIGTERM', module.exports.stop)
process.on('SIGINT', module.exports.stop)
