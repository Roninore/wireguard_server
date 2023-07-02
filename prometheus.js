const client = require('prom-client')

//1. Время ответа серверов телеграм + response.statusCode
const networkUsage = new client.Summary({
    name: 'network_usage',
    help: 'Network usage mbps',
    labelNames: ['type'],
    ageBuckets: 5,
    maxAgeSeconds: 60,
    pruneAgedBuckets:true,
})

//2. Количество пользователей
const activeUsersCount = new client.Gauge({
    name: 'active_users_count',
    help: 'Count of active users',
    labelNames: ['interface']
})




/**
 * Отдает метрики приложения
 * @returns {Metrics}
 */
async function getMetrics() {
    const metrics = await client.register.metrics()
    console.log('Получение метрик')
    return metrics
}

module.exports = {
    getMetrics,
    activeUsersCount,
    networkUsage
}