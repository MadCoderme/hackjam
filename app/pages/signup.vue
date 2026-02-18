<script setup lang="ts">
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { toast } from "vue-sonner"

const supabase = useSupabaseClient()
const email = ref('')
const username = ref('')
const password = ref('')
const loading = ref(false)
const signup = async() => {
    if (!email.value || !password.value || !username.value) {
        toast.error('All the fields are required')
        return
    }
    loading.value = true
    const { data, error } = await supabase.auth.signUp({
        email: email.value,
        password: password.value,
        options: {
            data: {
                user_name: username.value
            },
            emailRedirectTo: window.location.origin + '/verify'
        }
    })
    if (!error) {
        toast.success('Check your email inbox for verification link')
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
            <h1 class="text-2xl font-bold mb-5">Sign up</h1>
            <Input placeholder="Email" type="email" class="my-2" v-model="email" />
            <Input placeholder="Username" class="my-2" v-model="username" />
            <Input placeholder="Password" type="password" class="my-2" v-model="password" />
            <Button variant="default" class="mt-5 mb-2" :loading="loading" :disabled="loading" @click="signup()">Sign up</Button>
            <NuxtLink to="/login">Login to existing account</NuxtLink>
        </div>
    </div>
</template>