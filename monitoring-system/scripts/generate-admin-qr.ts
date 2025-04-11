import dotenv from 'dotenv';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function main() {
  try {
    // Загружаем переменные окружения
    dotenv.config({ path: path.join(__dirname, '../.env') });

    // Проверяем, запущен ли контейнер
    const { stdout: containers } = await execAsync('docker ps -a --filter name=whatsapp-client --format "{{.Names}}"');
    
    if (containers.includes('whatsapp-client')) {
      console.log('Контейнер WhatsApp уже запущен. Используется сохраненная сессия.');
      return;
    }

    // Запускаем контейнер
    console.log('Запуск контейнера WhatsApp...');
    await execAsync('docker-compose up -d whatsapp-client');

    // Ждем, пока контейнер запустится
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Показываем логи контейнера
    const { stdout: logs } = await execAsync('docker logs whatsapp-client -f');
    console.log(logs);

  } catch (error) {
    console.error('Ошибка:', error);
    process.exit(1);
  }
}

main(); 