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
      callback: '/verify',
    }
  },
  runtimeConfig: {
    public: {
      posthogPublicKey: 'phc_sKbYiizWB6NEGZC5IW6CK21lf8o073HDQ9flCuxkbq9',
      posthogHost: 'https://us.i.posthog.com',
      posthogDefaults: '2026-01-30'
    }
  }
})