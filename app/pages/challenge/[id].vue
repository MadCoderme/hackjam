<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import VueMarkdown from 'vue-markdown-render'
import { 
  LucideCheckCircle2, 
  LucideCircle, 
  LucideUpload, 
  LucidePlay, 
  LucideLoader2, 
  LucideTrophy, 
  LucideListOrdered,
  LucideRefreshCw
} from 'lucide-vue-next'
import { toast } from "vue-sonner"
import type { RealtimeChannel } from '@supabase/supabase-js'

const route = useRoute()
const user = useSupabaseUser()
const supabase = useSupabaseClient()
const challengeId = route.params.id as string

// State
const tasks = ref<any[]>([])
const activeTaskId = ref<string | null>(null)
const selectedFile = ref<File | null>(null)
const pastedCode = ref<string>('')
const isProcessing = ref(false)
const terminalOutput = ref<string[]>(['> Select a task to begin...'])
let realtimeChannel: RealtimeChannel | null = null

// Leaderboard State
const leaderboard = ref<any[]>([])
const isLeaderboardLoading = ref(false)

// Computed
const activeTask = computed(() => tasks.value.find(t => t.id === activeTaskId.value))

// 1. Fetch Challenge Tasks & User Status
const loadChallengeData = async () => {
  const { data : challengeData } = await supabase
    .from('challenges')
    .select('title, description, start_time')
    .eq('id', challengeId)
    .maybeSingle()

  if (challengeData) {
    if (new Date(challengeData.start_time) > new Date()) {
      toast.error("This challenge has not started yet");
      return
    }
    useHead({
      title: 'HackJam - ' + challengeData.title,
      meta: [
        { name: 'description', content: challengeData.description ?? "" }
      ]
    })
  }

  // A. Get Tasks
  const { data: taskData } = await supabase
    .from('sub_problems')
    .select('id, title, description_markdown, points, order_index')
    .eq('challenge_id', challengeId)
    .order('order_index')

  if (taskData) {
    tasks.value = taskData.map(t => ({ ...t, status: 'Pending', bestScore: 0 }))
    if (tasks.value.length > 0 && !activeTaskId.value) activeTaskId.value = tasks.value[0].id
    
    // Once tasks are known, we can fetch the leaderboard for these tasks
    fetchLeaderboard()
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

// 2. Fetch Leaderboard (Specific to this Challenge)
const fetchLeaderboard = async () => {
  if (tasks.value.length === 0) return
  isLeaderboardLoading.value = true

  try {
    const subProblemIds = tasks.value.map(t => t.id)
    
    // Fetch all submissions for these sub-problems
    const { data } = await supabase
      .from('submissions')
      .select(`
        score, sub_problem_id, user_id,
        profiles ( id, username, avatar_url )
      `)
      .in('sub_problem_id', subProblemIds)

    if (!data) return

    // Aggregation Logic: Sum Max Score per User per Problem
    const userScores: Record<string, { profile: any, score: number, solved: Set<string> }> = {}

    // First pass: Find max score per problem for each user
    // We need a nested map: userId -> problemId -> maxScore
    const userProblemMaxScores: Record<string, Record<string, number>> = {}

    data.forEach(sub => {
      const uid = sub.user_id
      const pid = sub.sub_problem_id
      
      if (!userProblemMaxScores[uid]) userProblemMaxScores[uid] = {}
      
      if ((userProblemMaxScores[uid][pid] || 0) < sub.score) {
        userProblemMaxScores[uid][pid] = sub.score
      }

      // Store profile info
      if (!userScores[uid]) {
        userScores[uid] = { 
          profile: sub.profiles, 
          score: 0, 
          solved: new Set() 
        }
      }
    })

    // Second pass: Sum up the max scores
    Object.keys(userProblemMaxScores).forEach(uid => {
      let total = 0
      Object.keys(userProblemMaxScores[uid]).forEach(pid => {
         total += userProblemMaxScores[uid][pid]
      })
      userScores[uid].score = total
    })

    // Convert to Array & Sort
    leaderboard.value = Object.values(userScores)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50) // Top 50

  } catch (e) {
    console.error("Leaderboard error", e)
  } finally {
    isLeaderboardLoading.value = false
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
     task.status = 'Attempted'
  }
}

// 3. File Upload Logic
const handleTaskSubmit = async () => {
  const hasFile = !!selectedFile.value
  const hasPaste = pastedCode.value && pastedCode.value.trim().length > 0
  if (!hasFile && !hasPaste) return
  if (!activeTaskId.value) return

  isProcessing.value = true
  terminalOutput.value = [`> Uploading solution for Task: ${activeTask.value.title}...`]

  try {
    const userId = user.value?.sub

    let uploadData: any = null
    if (hasFile && selectedFile.value) {
      const fileName = `${userId}/${activeTaskId.value}/${Date.now()}_${selectedFile.value.name}`
      const { data, error: uploadErr } = await supabase.storage.from('solutions').upload(fileName, selectedFile.value)
      if (uploadErr) throw uploadErr
      uploadData = data
    } else {
      const fileName = `${userId}/${activeTaskId.value}/${Date.now()}_pasted_solution.txt`
      const blob = new Blob([pastedCode.value], { type: 'text/plain' })
      const { data, error: uploadErr } = await supabase.storage.from('solutions').upload(fileName, blob)
      if (uploadErr) throw uploadErr
      uploadData = data
    }

    const { error: dbErr } = await supabase.from('submissions').insert({
      user_id: userId,
      challenge_id: challengeId,
      sub_problem_id: activeTaskId.value,
      code_url: uploadData.path,
      status: 'Pending'
    })

    if (dbErr) throw dbErr
    terminalOutput.value.push('> Queued. Waiting for Judge...')

    const task = tasks.value.find(t => t.id === activeTaskId.value)
    if (task) task.status = 'Processing'

    selectedFile.value = null
    pastedCode.value = ''

  } catch (err: any) {
    terminalOutput.value.push(`Error: ${err.message}`)
    isProcessing.value = false
  }
}

// 4. Realtime Listener
const setupRealtime = () => {
  if (!user.value) return

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
        const relevantTask = tasks.value.find(t => t.id === newSub.sub_problem_id)
        if (!relevantTask) return

        if (activeTaskId.value === newSub.sub_problem_id) {
           if (newSub.status === 'Processing') {
              terminalOutput.value.push('> Running tests...')
           } else if (newSub.status === 'Passed' || newSub.status === 'Failed' || newSub.status === 'Partial') {
              terminalOutput.value.push(`> Result: [${newSub.status.toUpperCase()}]`)
              terminalOutput.value.push(`> Score: ${newSub.score} / ${relevantTask.points}`)
              if(newSub.execution_time) terminalOutput.value.push(`> Time: ${newSub.execution_time}`)
              if(newSub.test_result) terminalOutput.value.push(`> Tests: ${newSub.test_result}`)
              
              isProcessing.value = false
              
              // Refresh leaderboard to reflect my new score
              fetchLeaderboard()
           } else if (newSub.status === 'Error') {
              terminalOutput.value.push(`> Failed to compile:`)
              processErrorLog(newSub.logs)
              isProcessing.value = false
           }
        }

        updateLocalTaskState(newSub)
      }
    )
    .subscribe()
}

const processErrorLog = (log: string) => {
  let errors = log.length > 2000 ? log.substring(log.length - 2000) : log

  let i = 1, reg
  if (reg = errors.match(/error CS1729: '(.+?)'/)) {
    terminalOutput.value.push(`Error ${i}: Did you properly create constructor(s) for '${reg[1]}'?`)
    i++
  }
  if (reg = errors.match(/error CS0017:/)) {
    terminalOutput.value.push(`Error ${i}: Multiple entry points detected. Have you submitted a Main function although the problem did not ask for it?`)
    i++
  }
  if (reg = errors.match(/error CS0050:.*return type '(.+?)'.*method '([a-zA-Z0-9_.]+)'/)) {
    terminalOutput.value.push(`Error ${i}: Return type '${reg[1]}' is less accessible than method '${reg[2]}'. You may make the return type public.`)
    i++
  }
  if (reg = errors.match(/error CS0122: '(.+?)' is inaccessible due to its protection level/)) {
    terminalOutput.value.push(`Error ${i}: '${reg[1]}' is inaccessible due to its protection level. You may need to make it public, protected or internal.`)
    i++
  }
  if (reg = errors.match(/error CS0246: The type or namespace name '(.+?)'/)) {
    terminalOutput.value.push(`Error ${i}: Type or namespace '${reg[1]}' not found. Did you forget using a directive or class declaration?`)
    i++
  }
  if (reg = errors.match(/error CS0103: The name '(.+?)' does not exist in the current context/)) {
    terminalOutput.value.push(`Error ${i}: Did you forget to declare or import a variable or method named '${reg[1]}'? Or is it a typo?`)
    i++
  }
  if (reg = errors.match(/error CS0117: '(.+?)' does not contain a definition for '(.+?)'/)) {
    terminalOutput.value.push(`Error ${i}: '${reg[1]}' does not contain a definition for '${reg[2]}'. Did you forget to implement a method or is it a typo?`)
    i++
  }
  if (i == 1) {
    terminalOutput.value.push(`Error: ${errors.length > 500 ? errors.substring(errors.length - 500) : errors}`)
  }
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
    
     <!-- LEFT PANEL: Sidebar -->
    <!-- 1. PARENT: Explicit h-full and overflow-hidden to contain the sidebar in the grid cell -->
    <div class="col-span-3 flex flex-col h-full overflow-hidden">
      
      <Card class="h-full flex flex-col border-none shadow-none bg-transparent">
        <Tabs default-value="tasks" class="h-full flex flex-col">
          
          <!-- Tab Switcher (shrink-0 prevents it from being squashed) -->
          <TabsList class="grid w-full grid-cols-2 mb-2 shrink-0">
            <TabsTrigger value="tasks" class="flex items-center gap-2">
              <LucideListOrdered class="h-4 w-4" /> Tasks
            </TabsTrigger>
            <TabsTrigger value="rankings" class="flex items-center gap-2">
              <LucideTrophy class="h-4 w-4" /> Rankings
            </TabsTrigger>
          </TabsList>

          <!-- TAB 1: TASKS -->
          <!-- 2. CONTENT WRAPPER: flex-1 to fill space, min-h-0 to force scrollbar -->
          <TabsContent value="tasks" class="flex-1 flex flex-col min-h-0 mt-0 data-[state=active]:flex">
            <!-- 3. INNER CARD: flex-1 and overflow-hidden to constrain the ScrollArea -->
            <Card class="flex-1 flex flex-col overflow-hidden border bg-card">
              <CardHeader class="pb-3 px-4 pt-4 shrink-0">
                <CardTitle class="text-lg">Problem Set</CardTitle>
                <p class="text-xs text-muted-foreground">Solve in any order</p>
              </CardHeader>
              <Separator class="shrink-0" />
              
              <!-- 4. SCROLL AREA: flex-1 h-full to fill the constrained parent -->
              <ScrollArea class="flex-1 h-full">
                <div class="p-4 space-y-2">
                  <button
                    v-for="task in tasks" 
                    :key="task.id"
                    @click="activeTaskId = task.id"
                    :class="[
                      'w-full flex items-center justify-between p-3 text-sm rounded-md transition-all border text-left',
                      activeTaskId === task.id 
                        ? 'bg-primary/10 border-primary text-primary font-medium' 
                        : 'hover:bg-muted border-transparent'
                    ]"
                  >
                    <div class="flex items-center gap-2 overflow-hidden">
                      <LucideCheckCircle2 v-if="task.status === 'Completed'" class="h-4 w-4 text-green-500 shrink-0" />
                      <LucideLoader2 v-else-if="task.status === 'Processing'" class="h-4 w-4 animate-spin text-blue-500 shrink-0" />
                      <LucideCircle v-else class="h-4 w-4 text-muted-foreground shrink-0" />
                      <span class="truncate">{{ task.title }}</span>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                      <span v-if="task.bestScore > 0" class="text-xs font-mono text-muted-foreground">{{ task.bestScore }}</span>
                      <Badge v-else variant="secondary" class="text-xs">{{ task.points }}</Badge>
                    </div>
                  </button>
                </div>
              </ScrollArea>
            </Card>
          </TabsContent>

          <!-- TAB 2: RANKINGS -->
          <!-- Applied exact same fix: flex-1, flex-col, min-h-0 -->
          <TabsContent value="rankings" class="flex-1 flex flex-col min-h-0 mt-0 data-[state=active]:flex">
            <Card class="flex-1 flex flex-col overflow-hidden border bg-card">
              <CardHeader class="pb-3 px-4 pt-4 flex flex-row items-center justify-between shrink-0">
                <div>
                  <CardTitle class="text-lg">Leaderboard</CardTitle>
                  <p class="text-xs text-muted-foreground">Top performers</p>
                </div>
                <Button variant="ghost" size="icon" @click="fetchLeaderboard" :disabled="isLeaderboardLoading">
                  <LucideRefreshCw :class="['h-4 w-4', isLeaderboardLoading ? 'animate-spin' : '']" />
                </Button>
              </CardHeader>
              <Separator class="shrink-0" />
              
              <ScrollArea class="flex-1 h-full">
                <div class="p-2 pb-50">
                   <div v-if="leaderboard.length === 0 && !isLeaderboardLoading" class="text-center py-8 text-muted-foreground text-sm">
                     No scores yet. Be the first!
                   </div>

                   <div v-for="(entry, index) in leaderboard" :key="entry.profile.id" 
                      :class="['flex items-center gap-3 p-2 rounded-md mb-1', entry.profile.id === user?.sub ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted']">
                      
                      <div class="w-6 text-center font-bold text-sm text-muted-foreground shrink-0">
                        <span v-if="index === 0">🥇</span>
                        <span v-else-if="index === 1">🥈</span>
                        <span v-else-if="index === 2">🥉</span>
                        <span v-else>{{ index + 1 }}</span>
                      </div>

                      <Avatar class="h-8 w-8 shrink-0">
                        <AvatarImage :src="entry.profile.avatar_url" />
                        <AvatarFallback>{{ entry.profile.username?.substring(0,2).toUpperCase() }}</AvatarFallback>
                      </Avatar>

                      <div class="flex-1 min-w-0">
                        <div class="text-sm font-medium truncate">
                          {{ entry.profile.username || 'Anonymous' }}
                        </div>
                      </div>

                      <div class="font-mono text-sm font-bold shrink-0">
                        {{ entry.score }}
                      </div>
                   </div>
                </div>
              </ScrollArea>
            </Card>
          </TabsContent>

        </Tabs>
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
        <!-- Submission (Tabs: Upload / Paste) -->
        <Card class="p-4 flex flex-col justify-between">
          <div v-if="user?.sub">
            <h3 class="font-semibold mb-2">Submit Solution</h3>
            <Tabs defaultValue="upload">
              <TabsList class="mb-2">
                <TabsTrigger value="upload">Upload</TabsTrigger>
                <TabsTrigger value="paste">Paste</TabsTrigger>
              </TabsList>

              <TabsContent value="upload">
                <input type="file" @change="e => selectedFile = (e.target as HTMLInputElement).files?.[0] || null" class="block w-full text-sm text-slate-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-full file:border-0
                  file:text-sm file:font-semibold
                  file:bg-violet-50 file:text-violet-700
                  hover:file:bg-violet-100
                 "/>
              </TabsContent>

              <TabsContent value="paste">
                <div class="text-xs text-muted-foreground mb-2">Paste your code below</div>
                <textarea v-model="pastedCode" placeholder="Paste your solution here..." class="w-full h-36 resize-none rounded-md border bg-transparent p-2 text-xs font-mono"></textarea>
              </TabsContent>
            </Tabs>
          </div>
          <div v-else class="text-center text-sm text-muted-foreground">
            Please <NuxtLink to="/login" class="text-primary hover:underline">log in</NuxtLink> to submit your solution.
          </div>

          <Button @click="handleTaskSubmit" :disabled="isProcessing || (!selectedFile && !pastedCode.trim())" class="w-full">
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