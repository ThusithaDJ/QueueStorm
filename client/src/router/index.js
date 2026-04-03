import { createRouter, createWebHistory } from 'vue-router'
import TestConfig      from '../views/TestConfig.vue'
import LiveMonitor     from '../views/LiveMonitor.vue'
import Environments    from '../views/Environments.vue'
import MessageBuilder  from '../views/MessageBuilder.vue'
import LogAnalyser     from '../views/LogAnalyser.vue'
import AuthPage        from '../views/AuthPage.vue'

const routes = [
  { path: '/',               component: TestConfig,     name: 'test-config' },
  { path: '/monitor',        component: LiveMonitor,    name: 'monitor' },
  { path: '/environments',   component: Environments,   name: 'environments' },
  { path: '/messages',       component: MessageBuilder, name: 'messages' },
  { path: '/log-analyser',   component: LogAnalyser,    name: 'log-analyser' },
  { path: '/auth',           component: AuthPage,       name: 'auth' },
]

export default createRouter({
  history: createWebHistory(),
  routes,
})

