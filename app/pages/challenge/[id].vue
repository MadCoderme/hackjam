<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import VueMarkdown from 'vue-markdown-render'
import { LucideCheckCircle2, LucideCircle, LucideUpload, LucidePlay, LucideLoader2 } from 'lucide-vue-next'
import type { RealtimeChannel } from '@supabase/supabase-js'

const route = useRoute()
const user = useSupabaseUser()
const supabase = useSupabaseClient()
const challengeId = route.params.id as string

// State
const tasks = ref<any[]>([])
const activeTaskId = ref<string | null>(null)
const selectedFile = ref<File | null>(null)
const isProcessing = ref(false)
const terminalOutput = ref<string[]>(['> Select a task to begin...'])
let realtimeChannel: RealtimeChannel | null = null

// Computed
const activeTask = computed(() => tasks.value.find(t => t.id === activeTaskId.value))

// 1. Fetch Challenge Tasks & User Status
const loadChallengeData = async () => {
  // A. Get Tasks
  const { data: taskData } = await supabase
    .from('sub_problems')
    .select('id, title, description_markdown, points, order_index')
    .eq('challenge_id', challengeId)
    .order('order_index')

  if (taskData) {
    tasks.value = taskData.map(t => ({ ...t, status: 'Pending', bestScore: 0 }))
    if (tasks.value.length > 0 && !activeTaskId.value) activeTaskId.value = tasks.value[0].id
  }

  // B. Get Previous Best Scores
  if (user.value) {
    const { data: subs } = await supabase
      .from('submissions')
      .select('sub_problem_id, score, status, test_result')
      .eq('user_id', user.value?.sub) // Use .id for Supabase user ID
      
    // Merge status into tasks
    subs?.forEach(sub => {
      updateLocalTaskState(sub)
    })
  }
}

// Helper: Updates the local task array based on a submission object
const updateLocalTaskState = (sub: any) => {
  const task = tasks.value.find(t => t.id === sub.sub_problem_id)
  if (!task) return

  // Update logic: Always keep the BEST score for the sidebar status
  if (sub.score > task.bestScore) {
    task.bestScore = sub.score
    task.status = sub.score === task.points ? 'Completed' : 'Attempted'
  } else if (task.bestScore === 0 && sub.status !== 'Processing') {
     // If they haven't scored yet, show they at least attempted it
     task.status = 'Attempted'
  }
}

// 2. File Upload Logic
const handleTaskSubmit = async () => {
  if (!selectedFile.value || !activeTaskId.value) return
  isProcessing.value = true
  terminalOutput.value = [`> Uploading solution for Task: ${activeTask.value.title}...`]

  try {
    // Note: using user.value?.sub is safer than .sub usually
    const userId = user.value?.sub 
    const fileName = `${userId}/${activeTaskId.value}/${Date.now()}_${selectedFile.value.name}`
    
    const { data: uploadData, error: uploadErr } = await supabase.storage.from('solutions').upload(fileName, selectedFile.value)
    if (uploadErr) throw uploadErr

    const { error: dbErr } = await supabase.from('submissions').insert({
      user_id: userId,
      challenge_id: challengeId,
      sub_problem_id: activeTaskId.value,
      code_url: uploadData.path,
      status: 'Pending'
    })
    
    if (dbErr) throw dbErr
    terminalOutput.value.push('> Queued. Waiting for Judge...')

    // Optimistic Update
    const task = tasks.value.find(t => t.id === activeTaskId.value)
    if (task) task.status = 'Processing'

  } catch (err: any) {
    terminalOutput.value.push(`Error: ${err.message}`)
    isProcessing.value = false
  }
}

// 3. Realtime Listener
const setupRealtime = () => {
  if (!user.value) return

  // Subscribe ONLY to updates for this user
  realtimeChannel = supabase
    .channel(`user_submissions_${user.value?.sub}`)
    .on(
      'postgres_changes',
      { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'submissions', 
        filter: `user_id=eq.${user.value?.sub}` 
      },
      (payload) => {
        const newSub = payload.new
        
        // Only react if this submission belongs to one of the current tasks
        const relevantTask = tasks.value.find(t => t.id === newSub.sub_problem_id)
        if (!relevantTask) return

        // 1. Update Terminal Log (If it's the active task)
        if (activeTaskId.value === newSub.sub_problem_id) {
           if (newSub.status === 'Processing') {
              terminalOutput.value.push('> Running tests...')
           } else if (newSub.status === 'Passed' || newSub.status === 'Failed' || newSub.status === 'Partial') {
              terminalOutput.value.push(`> Result: [${newSub.status.toUpperCase()}]`)
              terminalOutput.value.push(`> Score: ${newSub.score} / ${relevantTask.points}`)
              if(newSub.execution_time) terminalOutput.value.push(`> Time: ${newSub.execution_time}`)
              if(newSub.test_result) terminalOutput.value.push(`> Tests: ${newSub.test_result}`)
              
              // Stop the spinner
              isProcessing.value = false
           } else if (newSub.status === 'Error') {
              terminalOutput.value.push(`> System Error: ${newSub.logs?.substring(0, 50) || 'Unknown error'}`)
              isProcessing.value = false
           }
        }

        // 2. Update Sidebar State
        updateLocalTaskState(newSub)
      }
    )
    .subscribe()
}

onMounted(() => {
  loadChallengeData()
  setupRealtime()
})

onUnmounted(() => {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel)
})
</script>

<template>
  <div class="grid h-[calc(100vh-8rem)] grid-cols-12 gap-6">
    
    <!-- LEFT PANEL: Task Navigator -->
    <div class="col-span-3 flex flex-col gap-4">
      <Card class="h-full flex flex-col">
        <CardHeader class="pb-3">
          <CardTitle>Project Tasks</CardTitle>
          <p class="text-xs text-muted-foreground">You can solve them in any order</p>
        </CardHeader>
        <Separator />
        <ScrollArea class="flex-1">
          <div class="p-4 space-y-2">
            <button
              v-for="task in tasks" 
              :key="task.id"
              @click="activeTaskId = task.id"
              :class="[
                'w-full flex items-center justify-between p-3 text-sm rounded-md transition-all border',
                activeTaskId === task.id 
                  ? 'bg-primary/10 border-primary text-primary font-medium' 
                  : 'hover:bg-muted border-transparent'
              ]"
            >
              <div class="flex items-center gap-2">
                <LucideCheckCircle2 v-if="task.status === 'Completed'" class="h-4 w-4 text-green-500" />
                <LucideLoader2 v-else-if="task.status === 'Processing'" class="h-4 w-4 animate-spin text-blue-500" />
                <LucideCircle v-else class="h-4 w-4 text-muted-foreground" />
                <span>{{ task.title }}</span>
              </div>
              <div class="flex items-center gap-2">
                <span v-if="task.bestScore > 0" class="text-xs font-mono text-muted-foreground">{{ task.bestScore }}/{{ task.points }}</span>
                <Badge v-else variant="secondary" class="text-xs">{{ task.points }}pts</Badge>
              </div>
            </button>
          </div>
        </ScrollArea>
      </Card>
    </div>

    <!-- RIGHT PANEL: Task Details & Editor -->
    <div class="col-span-9 flex flex-col gap-4" v-if="activeTask">
      
      <!-- Task Description -->
      <Card class="flex-1 max-h-[calc(92vh-20rem)] overflow-y-auto p-6 custom-scrollbar">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-2xl font-bold">{{ activeTask.title }}</h2>
          <Badge :variant="activeTask.status === 'Completed' ? 'default' : 'outline'">
            {{ activeTask.status }}
          </Badge>
        </div>
        <div class="prose dark:prose-invert max-w-none">
          <vue-markdown :source="activeTask.description_markdown" />
        </div>
      </Card>

      <!-- Bottom Action Area -->
      <div class="h-64 grid grid-cols-2 gap-4">
        <!-- Upload -->
        <Card class="p-4 flex flex-col justify-between">
           <div>
             <h3 class="font-semibold mb-2">Submit Solution</h3>
             <input type="file" @change="e => selectedFile = (e.target as HTMLInputElement).files?.[0] || null" class="block w-full text-sm text-slate-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-violet-50 file:text-violet-700
                hover:file:bg-violet-100
              "/>
           </div>
           <Button @click="handleTaskSubmit" :disabled="isProcessing || !selectedFile" class="w-full">
             <LucideLoader2 v-if="isProcessing" class="mr-2 h-4 w-4 animate-spin" />
             <LucidePlay v-else class="mr-2 h-4 w-4" /> 
             {{ isProcessing ? 'Evaluating...' : 'Run Tests' }}
           </Button>
        </Card>

        <!-- Terminal -->
        <div class="rounded-md bg-zinc-950 p-4 font-mono text-xs text-green-400 overflow-y-auto border border-zinc-800">
           <div v-for="(line, i) in terminalOutput" :key="i">{{ line }}</div>
        </div>
      </div>
    </div>
  </div>
</template>