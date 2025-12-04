# Deployment Guide for Vercel

## Setting Up Environment Variables in Vercel

When deploying to Vercel, you **must** set the environment variable with the correct name:

### ✅ Correct Environment Variable Name:
```
VITE_GEMINI_API_KEY=your_api_key_here
```

### ❌ Incorrect (won't work):
```
GEMINI_API_KEY=your_api_key_here
```

## Steps to Deploy:

1. **Go to Vercel Dashboard**: https://vercel.com/dashboard

2. **Import your GitHub repository**:
   - Click "Add New Project"
   - Select your repository: `Virtual-Legal-Assistant-1.0`

3. **Configure Environment Variables**:
   - In the "Environment Variables" section
   - Click "Add" or "Edit"
   - **Name**: `VITE_GEMINI_API_KEY`
   - **Value**: Your Gemini API key (get it from https://aistudio.google.com/app/apikey)
   - **Environment**: Select all (Production, Preview, Development)
   - Click "Save"

4. **Deploy**:
   - Click "Deploy"
   - Wait for the build to complete

5. **Verify**:
   - Once deployed, visit your app URL
   - If the API key isn't working, users can click the "⚙️ Settings" button and enter their own API key

## Troubleshooting

### API calls not working?

1. **Check Environment Variable Name**:
   - Must be `VITE_GEMINI_API_KEY` (not `GEMINI_API_KEY`)
   - Vite only exposes variables prefixed with `VITE_` to client code

2. **Check Vercel Build Logs**:
   - Go to your project → Deployments → Click on a deployment
   - Check the build logs for any errors

3. **Use Settings Menu**:
   - Users can always use the "⚙️ Settings" button to enter their own API key
   - This key is stored locally in their browser

4. **Check Browser Console**:
   - Open browser DevTools (F12)
   - Check Console for error messages about missing API key

## Alternative: User-Provided API Keys

If you don't want to set a default API key in Vercel, users can:
1. Deploy the app without setting `VITE_GEMINI_API_KEY`
2. Use the "⚙️ Settings" button in the app
3. Enter their own API key
4. The app will use their personal key for all AI operations

This is actually more secure as each user uses their own quota!


