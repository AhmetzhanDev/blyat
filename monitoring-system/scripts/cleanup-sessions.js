#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')
const mongoose = require('mongoose')

// Загружаем переменные окружения
dotenv.config({ path: path.join(process.cwd(), '.env') })

// Импортируем модель (нужно будет скомпилировать TS в JS сначала или использовать require для JS версии)
// Для работы с TypeScript моделями используем require с ts-node
require('ts-node/register')
const { CompanySettings } = require('../src/models/CompanySettings')

// Папка с сессиями
const SESSIONS_DIR = path.join(process.cwd(), '.wwebjs_auth')

// Защищенные сессии которые нельзя удалять
const PROTECTED_SESSIONS = [
  'admin',
  'Default'  // Также админская сессия
]

/**
 * Получает список всех сессий из файловой системы
 */
const getAllSessions = () => {
  if (!fs.existsSync(SESSIONS_DIR)) {
    console.log('📂 Папка с сессиями не найдена:', SESSIONS_DIR)
    return []
  }

  const sessions = []
  const items = fs.readdirSync(SESSIONS_DIR)

  for (const item of items) {
    const fullPath = path.join(SESSIONS_DIR, item)
    
    try {
      const stats = fs.statSync(fullPath)
      
      if (stats.isDirectory()) {
        const sessionInfo = {
          sessionName: item,
          fullPath,
          isCompanySession: false
        }

        // Проверяем является ли это сессией компании
        if (item.startsWith('session-company-')) {
          sessionInfo.isCompanySession = true
          sessionInfo.companyId = item.replace('session-company-', '')
        }

        sessions.push(sessionInfo)
      }
    } catch (error) {
      console.warn(`⚠️  Ошибка при проверке ${item}:`, error.message)
    }
  }

  return sessions
}

/**
 * Получает список активных компаний из БД
 */
const getActiveCompanies = async () => {
  try {
    const companies = await CompanySettings.find({}, { _id: 1 }).lean()
    return companies.map(company => company._id.toString())
  } catch (error) {
    console.error('❌ Ошибка при получении компаний из БД:', error)
    return []
  }
}

/**
 * Безопасно удаляет папку с сессией
 */
const deleteSession = (sessionPath) => {
  try {
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true })
      console.log('🗑️  Удалена сессия:', sessionPath)
      return true
    }
    return false
  } catch (error) {
    console.error('❌ Ошибка при удалении сессии:', sessionPath, error)
    return false
  }
}

/**
 * Основная функция очистки сессий
 */
const cleanupSessions = async () => {
  try {
    console.log('🚀 Начинаем очистку сессий WhatsApp...')
    console.log('📂 Папка с сессиями:', SESSIONS_DIR)

    // Подключаемся к БД
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/monitoring'
    await mongoose.connect(mongoUri)
    console.log('✅ Подключение к БД установлено')

    // Получаем все сессии из файловой системы
    const allSessions = getAllSessions()
    console.log(`📊 Найдено сессий в файловой системе: ${allSessions.length}`)

    if (allSessions.length === 0) {
      console.log('✨ Нет сессий для очистки')
      return
    }

    // Получаем активные компании из БД
    const activeCompanies = await getActiveCompanies()
    console.log(`📊 Найдено активных компаний в БД: ${activeCompanies.length}`)

    let deletedCount = 0
    let protectedCount = 0
    let keptCount = 0

    // Проверяем каждую сессию
    for (const session of allSessions) {
      console.log(`\n🔍 Проверяем сессию: ${session.sessionName}`)

      // Проверяем защищенные сессии
      if (PROTECTED_SESSIONS.includes(session.sessionName)) {
        console.log(`🛡️  Защищенная сессия (админская): ${session.sessionName}`)
        protectedCount++
        continue
      }

      // Если это сессия компании
      if (session.isCompanySession && session.companyId) {
        const companyExists = activeCompanies.includes(session.companyId)
        
        if (companyExists) {
          console.log(`✅ Компания найдена в БД: ${session.companyId}`)
          keptCount++
        } else {
          console.log(`❌ Компания НЕ найдена в БД: ${session.companyId}`)
          console.log(`🗑️  Удаляем сессию: ${session.sessionName}`)
          
          if (deleteSession(session.fullPath)) {
            deletedCount++
          }
        }
      } else {
        // Неопознанная сессия - удаляем с осторожностью
        console.log(`⚠️  Неопознанная сессия: ${session.sessionName}`)
        console.log(`🔍 Путь: ${session.fullPath}`)
        
        // Можно добавить дополнительную логику для таких сессий
        // Пока оставляем как есть для безопасности
        console.log(`⏭️  Пропускаем неопознанную сессию`)
        keptCount++
      }
    }

    // Итоговая статистика
    console.log('\n' + '='.repeat(50))
    console.log('📊 ИТОГОВАЯ СТАТИСТИКА:')
    console.log(`🗑️  Удалено сессий: ${deletedCount}`)
    console.log(`🛡️  Защищенных сессий: ${protectedCount}`)
    console.log(`✅ Оставлено сессий: ${keptCount}`)
    console.log(`📂 Всего проверено: ${allSessions.length}`)
    console.log('='.repeat(50))

    if (deletedCount > 0) {
      console.log('\n⚠️  ВАЖНО: Перезапустите сервер для применения изменений')
    }

  } catch (error) {
    console.error('❌ Критическая ошибка при очистке сессий:', error)
  } finally {
    // Закрываем соединение с БД
    await mongoose.disconnect()
    console.log('🔌 Соединение с БД закрыто')
  }
}

/**
 * Функция для получения информации о сессиях без удаления
 */
const listSessions = async () => {
  try {
    console.log('📊 Анализ сессий WhatsApp...')
    
    // Подключаемся к БД
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/monitoring'
    await mongoose.connect(mongoUri)

    const allSessions = getAllSessions()
    const activeCompanies = await getActiveCompanies()

    console.log('\n' + '='.repeat(60))
    console.log('📂 АНАЛИЗ СЕССИЙ:')
    console.log('='.repeat(60))

    for (const session of allSessions) {
      console.log(`\n📁 Сессия: ${session.sessionName}`)
      console.log(`📍 Путь: ${session.fullPath}`)

      if (PROTECTED_SESSIONS.includes(session.sessionName)) {
        console.log(`🛡️  Статус: ЗАЩИЩЕННАЯ (админская)`)
      } else if (session.isCompanySession && session.companyId) {
        const exists = activeCompanies.includes(session.companyId)
        console.log(`🏢 ID компании: ${session.companyId}`)
        console.log(`📊 Статус: ${exists ? '✅ АКТИВНАЯ' : '❌ НЕ НАЙДЕНА В БД'}`)
      } else {
        console.log(`❓ Статус: НЕОПОЗНАННАЯ`)
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log(`📊 Всего сессий: ${allSessions.length}`)
    console.log(`🏢 Активных компаний в БД: ${activeCompanies.length}`)
    console.log('='.repeat(60))

  } catch (error) {
    console.error('❌ Ошибка при анализе сессий:', error)
  } finally {
    await mongoose.disconnect()
  }
}

// Основная логика
const main = async () => {
  const args = process.argv.slice(2)
  const command = args[0]

  switch (command) {
    case 'list':
    case 'analyze':
      await listSessions()
      break
    case 'clean':
    case 'cleanup':
      await cleanupSessions()
      break
    default:
      console.log('📋 Использование:')
      console.log('  node scripts/cleanup-sessions.js list     - Показать анализ сессий')
      console.log('  node scripts/cleanup-sessions.js clean    - Удалить неиспользуемые сессии')
      console.log('')
      console.log('💡 Рекомендуется сначала выполнить analyze для просмотра')
      break
  }
}

// Запускаем скрипт
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Критическая ошибка:', error)
    process.exit(1)
  })
}

module.exports = { cleanupSessions, listSessions } 