<script setup lang="ts">
import { LucideCode2, LucideTrophy, LucideUser } from 'lucide-vue-next'
import 'vue-sonner/style.css'
import { Toaster } from '@/components/ui/sonner'

const user = useSupabaseUser()

</script>

<template>
  <div class="min-h-screen bg-background font-sans antialiased text-foreground">
    <!-- Navbar -->
    <header class="border-b bg-card">
      <div class="container flex h-16 items-center justify-between px-4">
        <div class="flex items-center gap-2">
          <LucideCode2 class="h-6 w-6 text-primary" />
          <span class="text-lg font-bold tracking-tight">HackJam</span>
        </div>
        
        <nav class="flex items-center gap-6 text-sm font-medium">
          <NuxtLink to="/" class="transition-colors hover:text-primary">Lobby</NuxtLink>
          <NuxtLink to="/leaderboard" class="transition-colors hover:text-primary">Leaderboard</NuxtLink>
        </nav>

        <div class="flex items-center gap-4">
          <NuxtLink class="flex items-center gap-2 text-sm text-muted-foreground" to="/profile">
            <LucideUser class="h-4 w-4" />
            <span>{{ user?.user_metadata.user_name  ?? "Login" }}</span>
          </NuxtLink>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="container flex-1 p-6">
      <slot />
      <Toaster position="top-right" richColors />
    </main>

    <footer class="border-t py-6 text-center text-sm text-muted-foreground">
      Made with ❤️ by CUET CSE-24
    </footer>
  </div>
</template>