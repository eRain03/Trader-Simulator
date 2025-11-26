import { createApp } from 'vue'
import router from './router.js'
import App from './App.vue'
import './global.css'

createApp(App)
  .use(router)
  .mount('#app')

console.log(['Hello 笔.COOL 控制台'])