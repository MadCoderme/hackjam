// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  modules: [
    'shadcn-nuxt',
    '@nuxtjs/supabase',
    '@nuxtjs/color-mode',
  ],

  vite: {
    plugins: [
      tailwindcss(),
    ],
  },

  shadcn: {
    prefix: '',
    componentDir: '~/components/ui' 
  },

  colorMode: {
    classSuffix: '', 
  },

  supabase: {
    redirect: false,
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
    }
  }
})