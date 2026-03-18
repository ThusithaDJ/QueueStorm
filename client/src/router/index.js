import { createRouter, createWebHistory } from 'vue-router'
import TestConfig from '../views/TestConfig.vue'
import LiveMonitor from '../views/LiveMonitor.vue'

const routes = [
  { path: '/', component: TestConfig },
  { path: '/monitor', component: LiveMonitor }
]

export default createRouter({
  history: createWebHistory(),
  routes
})
