<script setup lang="ts">
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LucideTimer, LucideArrowRight } from 'lucide-vue-next'

const supabase = useSupabaseClient()

const { data: challenges, pending } = await useAsyncData('challenges', async () => {
  const { data } = await supabase.from('challenges').select('*').order('start_time')
  return data
})
useHead({
  title: 'HackJam - Tiny Hackathons',
  meta: [
    { name: 'description', content: 'Discover and join active hackathons on HackJam. Compete, collaborate, and innovate with developers worldwide.' }
  ]
})
</script>

<template>
  <div class="space-y-8">
    <h1 class="text-3xl font-bold tracking-tight">Active Hackathons</h1>

    <div v-if="pending">Loading events...</div>

    <div v-else class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <Card v-for="challenge in challenges" :key="challenge.id" class="flex flex-col">
        <CardHeader>
          <div class="flex justify-between items-start">
            <Badge :variant="challenge.status === 'Live' ? 'destructive' : 'secondary'">
              {{ challenge.status }}
            </Badge>
          </div>
          <CardTitle class="mt-2">{{ challenge.title }}</CardTitle>
          <CardDescription>{{ challenge.description }}</CardDescription>
        </CardHeader>
        
        <CardContent class="flex-1">
          <div class="flex gap-2 flex-wrap">
            <Badge variant="outline" v-for="tag in challenge.tags" :key="tag">{{ tag }}</Badge>
          </div>
        </CardContent>

        <CardFooter>
          <Button class="w-full" as-child v-if="challenge.status === 'Live'">
            <NuxtLink :to="`/challenge/${challenge.id}`">
              Enter Workspace <LucideArrowRight class="ml-2 h-4 w-4" />
            </NuxtLink>
          </Button>
          <Button class="w-full" variant="secondary" disabled v-else>
            {{ challenge.status }}
          </Button>
        </CardFooter>
      </Card>
    </div>
  </div>
</template>