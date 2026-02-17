<script setup lang="ts">
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { toast } from "vue-sonner"

const supabase = useSupabaseClient()
const email = ref('')
const password = ref('')
const loading = ref(false)
const login = async() => {
    loading.value = true
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email.value,
        password: password.value
    })
    if (!error) {
        navigateTo('/')
    } else {
        console.log(error.code)
        toast.error(error.message)
    }
    loading.value = false
}
</script>
<template>
    <div class="max-w-lg mx-auto space-y-6">
        <div class="flex flex-col items-center">
            <h1 class="text-2xl font-bold mb-5">Login</h1>
            <Input placeholder="Email" class="my-2" v-model="email" />
            <Input placeholder="Password" type="password" class="my-2" v-model="password" />
            <Button variant="default" class="mt-5 mb-2" :loading="loading" :disabled="loading" @click="login()">Login</Button>
            <NuxtLink to="/signup">Create an account</NuxtLink>
        </div>
    </div>
</template>