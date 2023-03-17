import { chromium, type Page } from 'playwright'
import { type Browser, expect } from '@playwright/test'
import { type Context, Markup, Telegraf } from 'telegraf'
import dotenv from 'dotenv'
import { type InputFile } from 'telegraf/types'
import { message } from 'telegraf/filters'
import cron from 'node-cron'

dotenv.config()
// const url = 'https://icp.administracionelectronica.gob.es/icpplustiem/citar?p=28&locale=es&appkey=null'
const url = 'https://icp.administracionelectronica.gob.es/icpplustiem/citar?p=1&locale=es&appkey=null'
const { NIE, NAME, COUNTRY_CODE, EMAIL, PHONE_NUMBER } = process.env
const NO_APPOINTMENT = 'no hay citas disponibles'
const delay = async (ms: number) => await new Promise(resolve => setTimeout(resolve, ms))
const screenshots = [] as Array<{ inputFile: InputFile, message: string }>
const sendScreenshots = async (bot: Telegraf) => {
  await bot.telegram.sendMediaGroup(CHAT_ID, screenshots.map(({ inputFile, message }) => ({
    type: 'photo',
    media: inputFile,
    caption: message
  })))
  screenshots.length = 0
}
const saveScreenshot = async (page: Page, message: string) => {
  const screenshot = await page.screenshot()
  const inputFile: InputFile = {
    source: screenshot,
    filename: 'screenshot.png'
  }
  screenshots.push({ inputFile, message })
}
const sendText = async (bot: Telegraf, text: string) => {
  await bot.telegram.sendMessage(CHAT_ID, text)
}

const CHAT_ID = process.env.CHAT_ID ?? ''
const bot = new Telegraf(process?.env.BOT_TOKEN ?? '')
const MENU = {
  SCRAPE_NOW: 'Scrape now',
  START_TIMER: 'Start timer',
  STOP_TIMER: 'Stop timer'
} as const
bot.start(async (ctx) => {
  await ctx.reply(`chat id: ${ctx.chat.id}`, Markup
    .keyboard([
      [MENU.SCRAPE_NOW],
      [MENU.START_TIMER],
      [MENU.STOP_TIMER]
    ])
    .oneTime()
    .resize()
  )
})
const step1 = async (page: Page) => {
  await page.goto(url)
  await saveScreenshot(page, 'step 1')
}
const step2 = async (page: Page) => {
  const select = page.getByLabel('TRÁMITES CUERPO NACIONAL DE POLICÍA')
  try {
    await expect(select).toBeEnabled()
    await select.selectOption(['4010'])

    await delay(2000)

    await page.click('#btnAceptar')
    await saveScreenshot(page, 'step 2')
  } catch (e) {
    await saveScreenshot(page, 'select is not enabled')
    await sendText(bot, 'select is not enabled, ' + JSON.stringify(e))
    await page.close()
  }
}

const step3 = async (page: Page) => {
  await page.click('#btnEntrar')
  await saveScreenshot(page, 'step 3')
}
const step4 = async (page: Page) => {
  await page.locator('#txtIdCitado').fill(NIE ?? '')
  await page.locator('#txtDesCitado').fill(NAME ?? '')
  await page.locator('#txtPaisNac').selectOption([COUNTRY_CODE ?? ''])
  await delay(2000)
  await saveScreenshot(page, 'filled form')
  await page.click('#btnEnviar')
  await saveScreenshot(page, 'step 4')
}

const step5 = async (page: Page, browser: Browser) => {
  try {
    if (await page.getByText(NO_APPOINTMENT).count() > 0) {
      await saveScreenshot(page, 'step 5 failed')
      await sendText(bot, 'No hay citas disponibles')
      await page.close()
      await browser.close()
      return
    }
    await delay(2000)
    const button = await page.waitForSelector('#btnEnviar', { timeout: 1000 })
    await button.click()
    await saveScreenshot(page, 'step 5')
  } catch (e) {
    await saveScreenshot(page, 'step 5')
    await sendText(bot, 'No hay citas disponibles')
  }
}
const step6 = async (page: Page) => {
  await delay(2000)
  await page.click('#btnEnviar')
  await saveScreenshot(page, 'step 6')
}

const step7 = async (page: Page) => {
  const select = page.getByLabel('Oficina:')
  try {
    await expect(select).toBeEnabled()
    await select.selectOption({ index: 0 })

    await delay(2000)

    await page.click('#btnSiguiente')
    await saveScreenshot(page, 'step 7')
  } catch (e) {
    await saveScreenshot(page, 'select is not enabled')
    await sendText(bot, 'select is not enabled, ' + JSON.stringify(e))
    await page.close()
  }
}

const step8 = async (page: Page) => {
  try {
    await page.locator('#txtTelefonoCitado').fill(PHONE_NUMBER ?? '')
    await page.locator('#emailUNO').fill(EMAIL ?? '')
    await page.locator('#emailDOS').selectOption([EMAIL ?? ''])
    await delay(2000)
    await page.click('#btnSiguiente')
    await saveScreenshot(page, 'step 8')
  } catch (e) {
    await saveScreenshot(page, 'step 8 failed' + JSON.stringify(e))
  }
}
const step9 = async (page: Page) => {
  try {
    page.on('dialog', dialog => {
      void dialog.accept()
    }
    )
    const captcha = await page.waitForSelector('#captcha', { timeout: 1000 })
    const isCaptchaVisible = await captcha.isVisible()
    if (isCaptchaVisible) {
      await saveScreenshot(page, 'captcha')
      await sendText(bot, 'captcha')
      const captchaSolved = await waitForUserMessage()
      if (typeof captchaSolved === 'string') {
        await captcha.fill(captchaSolved)
      }
      await saveScreenshot(page, 'step 9 captcha solved')
    }
    await page.getByRole('link', { name: 'LIBRE' }).click()
    await saveScreenshot(page, 'step 9 finished')
  } catch (e) {
    await saveScreenshot(page, 'step 9 failed' + JSON.stringify(e))
  }
}
const step10 = async (page: Page) => {
  try {
    const codeFromPhone = await page.waitForSelector('#txtCodigoVerificacion', { timeout: 1000 })
    const isVerificationVisible = await codeFromPhone.isVisible()
    if (isVerificationVisible) {
      await sendText(bot, 'verification code')
      const solved = await waitForUserMessage()
      if (typeof solved === 'string') {
        await codeFromPhone.fill(solved)
      }
      await saveScreenshot(page, 'step 10 verification solved')
    }
    await page.locator('#conforme').click()
    await delay(500)
    await page.locator('#conformidadCorreo').click()
    await delay(500)
    await saveScreenshot(page, 'step 10 before click')
    await page.locator('#btnConfirmar').click()
    await saveScreenshot(page, 'step 10 finished')
  } catch (e) {
    await saveScreenshot(page, 'step 10 failed' + JSON.stringify(e))
  }
}
const scrape = async () => {
  const browser = await chromium.launch({ slowMo: 100 })
  try {
    const page = await browser.newPage()
    await step1(page)
    await step2(page)
    await step3(page)
    await step4(page)
    await step5(page, browser)
    await step6(page)
    await step7(page)
    await step8(page)
    await step9(page)
    await step10(page)
    await page.close()
    await browser.close()
  } catch (e) {
    await sendText(bot, JSON.stringify(e))
    await browser?.close?.()
  } finally {
    await sendScreenshots(bot)
  }
}
const cronTask = cron.schedule('*/4 9-17 * * *', async () => {
  await scrape()
}, { scheduled: false })
console.log('valid: ', cron.validate('*/4 9-17 * * *'))
async function waitForUserMessage () {
  return await new Promise((resolve) => {
    const messageHandler = async (newCtx: Context) => {
      resolve(newCtx.message)
    }

    bot.on('message', messageHandler)
  })
}
bot.on(message('text'), async (ctx) => {
  const text = ctx.message?.text
  if (ctx.message.from.id !== Number(process.env.MY_TELEGRAM_ID)) return

  if (text === MENU.SCRAPE_NOW) {
    await scrape()
  }
  if (text === MENU.START_TIMER) {
    await cronTask.start()
    await sendText(bot, 'Timer started')
  }
  if (text === MENU.STOP_TIMER) {
    await cronTask.stop()
    await sendText(bot, 'Timer stopped')
  }
})

void bot.launch()

process.once('SIGINT', () => { bot.stop('SIGINT') })
process.once('SIGTERM', () => { bot.stop('SIGTERM') })
