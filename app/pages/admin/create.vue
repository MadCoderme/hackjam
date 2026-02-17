<script setup lang="ts">
import { ref, reactive } from 'vue'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { 
  LucidePlus, 
  LucideTrash2, 
  LucideSave, 
  LucideCalendarClock, 
  LucideAlertCircle,
  LucideUpload,
  LucideFileCode
} from 'lucide-vue-next'

const supabase = useSupabaseClient()
const router = useRouter()
const isSubmitting = ref(false)

// --- STATE ---

// 1. Parent Challenge Data
const challengeForm = reactive({
  title: '',
  description: '', 
  difficulty: 'Medium',
  start_time: '', 
  end_time: '',
  tags: '',
})

// 2. Sub-problems (Tasks)
interface Task {
  title: string
  points: number
  order_index: number
  description_markdown: string
  testFile: File | null // <--- Added to store the selected file
}

const tasks = ref<Task[]>([
  { title: 'Task 1: Setup', points: 100, order_index: 1, description_markdown: '', testFile: null }
])

// --- ACTIONS ---

const addTask = () => {
  tasks.value.push({ 
    title: `Task ${tasks.value.length + 1}: `, 
    points: 100, 
    order_index: tasks.value.length + 1,
    description_markdown: '',
    testFile: null
  })
}

const removeTask = (index: number) => {
  if (tasks.value.length > 1) {
    tasks.value.splice(index, 1)
    // Re-index remaining tasks
    tasks.value.forEach((t, i) => t.order_index = i + 1)
  }
}

const handleFileChange = (index: number, event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files && target.files[0]) {
    tasks.value[index].testFile = target.files[0]
  }
}

const handleCreate = async () => {
  // Basic Validation
  if (!challengeForm.title) return alert('Title is required')
  if (!challengeForm.start_time || !challengeForm.end_time) return alert('Start and End times are required')
  
  // Validate that all tasks have a test file
  const missingFiles = tasks.value.some(t => !t.testFile)
  if (missingFiles) return alert('All tasks must have a Test (.cs) file uploaded.')

  if (new Date(challengeForm.end_time) <= new Date(challengeForm.start_time)) {
    return alert('End time must be after Start time')
  }

  isSubmitting.value = true
  
  try {
    const now = new Date()
    const start = new Date(challengeForm.start_time)
    const derivedStatus = start > now ? 'Upcoming' : 'Live'

    // 1. Insert Challenge
    const { data: challenge, error: challengeError } = await supabase
      .from('challenges')
      .insert({
        title: challengeForm.title,
        description: challengeForm.description,
        difficulty: challengeForm.difficulty,
        start_time: new Date(challengeForm.start_time).toISOString(),
        end_time: new Date(challengeForm.end_time).toISOString(),
        status: derivedStatus, 
        tags: challengeForm.tags.split(',').map(t => t.trim()).filter(t => t.length > 0)
      })
      .select()
      .single()

    if (challengeError) throw challengeError

    // 2. Insert Sub-problems AND Select returned data (to get IDs)
    const taskPayload = tasks.value.map((t, index) => ({
      challenge_id: challenge.id,
      title: t.title,
      description_markdown: t.description_markdown,
      points: t.points,
      order_index: index + 1
    }))

    const { data: createdSubProblems, error: tasksError } = await supabase
      .from('sub_problems')
      .insert(taskPayload)
      .select('id, order_index') // <--- Crucial: Get the IDs back

    if (tasksError) throw tasksError
    if (!createdSubProblems) throw new Error("Failed to create sub-problems")

    // 3. Upload Test Files for each Sub-problem
    // We match the created DB rows with our local state using order_index
    const uploadPromises = tasks.value.map(async (localTask) => {
      const dbTask = createdSubProblems.find(db => db.order_index === localTask.order_index)
      
      if (dbTask && localTask.testFile) {
        // Path: challenge-tests/{sub-problem-id}.cs
        const fileName = `${dbTask.id}.cs` 
        
        const { error: uploadError } = await supabase
          .storage
          .from('challenge-tests')
          .upload(fileName, localTask.testFile, {
            upsert: true,
            contentType: 'text/plain' // Force text/plain for code files
          })

        if (uploadError) throw uploadError
      }
    })

    await Promise.all(uploadPromises)

    // Success
    router.push(`/challenge/${challenge.id}`)

  } catch (err: any) {
    console.error(err)
    alert(`Error: ${err.message}`)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="container max-w-6xl mx-auto py-10 space-y-8">
    
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Create New Challenge</h1>
        <p class="text-muted-foreground">Setup the scenario, schedule, and tasks.</p>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline" @click="router.back()">Cancel</Button>
        <Button size="default" @click="handleCreate" :disabled="isSubmitting">
          <LucideSave class="mr-2 h-4 w-4" /> 
          {{ isSubmitting ? 'Publishing...' : 'Publish Challenge' }}
        </Button>
      </div>
    </div>

    <Separator />

    <!-- MAIN FORM GRID -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
      
      <!-- LEFT COLUMN (Meta Data) -->
      <div class="lg:col-span-4 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>Basic settings and schedule.</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            
            <div class="space-y-2">
              <label class="text-sm font-medium leading-none">Challenge Title</label>
              <Input v-model="challengeForm.title" placeholder="e.g. NeoBank Backend System" />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <label class="text-sm font-medium leading-none">Difficulty</label>
                <select v-model="challengeForm.difficulty" class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <option>Easy</option>
                  <option>Medium</option>
                  <option>Hard</option>
                </select>
              </div>
              <div class="space-y-2">
                <label class="text-sm font-medium leading-none">Tags</label>
                <Input v-model="challengeForm.tags" placeholder="C#, OOP" />
              </div>
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium leading-none flex items-center gap-2">
                <LucideCalendarClock class="h-4 w-4 text-muted-foreground" /> Start Time
              </label>
              <Input type="datetime-local" v-model="challengeForm.start_time" />
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium leading-none flex items-center gap-2">
                <LucideCalendarClock class="h-4 w-4 text-muted-foreground" /> End Time
              </label>
              <Input type="datetime-local" v-model="challengeForm.end_time" />
            </div>

          </CardContent>
        </Card>

        <!-- Preview Tip -->
        <div class="rounded-md bg-blue-50 dark:bg-blue-950 p-4 border border-blue-200 dark:border-blue-900">
          <div class="flex gap-3">
            <LucideAlertCircle class="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <div class="text-sm text-blue-800 dark:text-blue-300">
              <p class="font-semibold">Tip:</p>
              <p>Challenges set to start in the future will automatically be marked as "Upcoming" in the lobby.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- RIGHT COLUMN (Content) -->
      <div class="lg:col-span-8 space-y-6">
        
        <!-- Scenario Description -->
        <Card>
          <CardHeader>
            <CardTitle>Scenario Description</CardTitle>
            <CardDescription>The main story and context for the participants.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea 
              v-model="challengeForm.description" 
              class="min-h-[200px] font-mono text-sm leading-relaxed" 
              placeholder="# Introduction&#10;You are the lead backend engineer at..." 
            />
            <p class="text-xs text-muted-foreground mt-2 text-right">Markdown formatting supported.</p>
          </CardContent>
        </Card>

        <!-- Sub Problems Section -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold tracking-tight">Sub-Problems</h2>
            <Button variant="secondary" size="sm" @click="addTask">
              <LucidePlus class="mr-2 h-4 w-4" /> Add Task
            </Button>
          </div>

          <div class="space-y-4">
            <Card v-for="(task, index) in tasks" :key="index" class="group relative overflow-hidden transition-all hover:border-primary/50">
              <div class="absolute left-0 top-0 bottom-0 w-1 bg-muted group-hover:bg-primary transition-colors"></div>
              
              <CardContent class="p-6 pl-8">
                <div class="flex flex-col md:flex-row gap-4 mb-4">
                  <!-- Title Input -->
                  <div class="flex-1 space-y-1">
                    <label class="text-xs font-semibold text-muted-foreground uppercase">Task Title</label>
                    <Input v-model="task.title" placeholder="e.g. Phase 1: Setup" class="font-medium" />
                  </div>
                  
                  <!-- Points Input -->
                  <div class="w-32 space-y-1">
                    <label class="text-xs font-semibold text-muted-foreground uppercase">Points</label>
                    <Input type="number" v-model="task.points" />
                  </div>

                  <!-- Remove Button -->
                  <div class="flex items-end">
                    <Button variant="ghost" size="icon" class="text-muted-foreground hover:text-destructive transition-colors" @click="removeTask(index)">
                      <LucideTrash2 class="h-5 w-5" />
                    </Button>
                  </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <!-- Markdown Input -->
                  <div class="space-y-1">
                    <label class="text-xs font-semibold text-muted-foreground uppercase">Instructions (Markdown)</label>
                    <Textarea 
                      v-model="task.description_markdown" 
                      class="min-h-[120px] font-mono text-sm bg-muted/30" 
                      placeholder="### Objective..." 
                    />
                  </div>

                  <!-- Test File Upload (New Section) -->
                  <div class="space-y-1">
                    <label class="text-xs font-semibold text-muted-foreground uppercase">Test Harness (.cs)</label>
                    <div class="border-2 border-dashed rounded-lg h-[120px] flex flex-col items-center justify-center bg-muted/10 hover:bg-muted/20 transition-colors relative">
                      
                      <!-- Hidden Input -->
                      <input 
                        type="file" 
                        accept=".cs,.txt" 
                        class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        @change="(e) => handleFileChange(index, e)"
                      />

                      <div v-if="task.testFile" class="text-center px-2">
                        <LucideFileCode class="h-6 w-6 mx-auto text-primary mb-1" />
                        <p class="text-sm font-medium truncate max-w-[150px]">{{ task.testFile.name }}</p>
                        <p class="text-xs text-muted-foreground">Click to replace</p>
                      </div>

                      <div v-else class="text-center">
                        <LucideUpload class="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                        <p class="text-sm text-muted-foreground">Upload Test File</p>
                        <p class="text-xs text-muted-foreground/50">Hidden tests & boilerplates</p>
                      </div>
                    </div>
                  </div>
                </div>

              </CardContent>
            </Card>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>