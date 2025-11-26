<script setup>
import { ref } from "vue"

const title = ref("Hello 笔.COOL");
const descr = ref("一笔一划，绘就人生；一码一境，酷创未来。");
</script>

<template>
  <div class="container">

    <h1>{{ title }}</h1>
    <p><i>{{ descr }}</i></p>

    <!-- vue logo -->
    <a href="https://vuejs.org/" target="_blank">
      <svg class="logo" viewBox="0 0 128 128" width="24" height="24" data-v-97365a3e="">
        <path fill="#42b883" d="M78.8,10L64,35.4L49.2,10H0l64,110l64-110C128,10,78.8,10,78.8,10z" data-v-97365a3e="">
        </path>
        <path fill="#35495e" d="M78.8,10L64,35.4L49.2,10H25.6L64,76l38.4-66H78.8z" data-v-97365a3e=""></path>
      </svg>
    </a>

  </div>
</template>

<style lang="scss" scoped>
$bg: #f0f2f5;

.container {

  background: $bg;

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.logo {
  height: 40px;
  width: 40px;
  margin-top: 20px;
}

h1 {
  color: #333;
  text-align: center;
}

p {
  color: #666;
  text-align: center;
}
</style>
