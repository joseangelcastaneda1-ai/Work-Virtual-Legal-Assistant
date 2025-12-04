# Virtual Legal Assistant

A comprehensive AI-Powered legal assistant for immigration attorneys to analyze and sort documents, generate personalized cover letters and legal arguments in support of your clients, review and summarize FOIAs, review and analyze immigration implications of your client's criminal history, and AI-integrated feature to ask any immigration question.

## 🚀 Quick Start - (Recommended)

**One-Click Deploy:** https://work-virtual-legal-assistant.vercel.app/

**Note**: If you don't set the API key, users can still use the app by clicking the "⚙️ Settings" button and entering their own API key.

## 📋 Features

- **VAWA Application** - Generate VAWA self-petition packets
- **I-130 Adjustment** - Process family-based adjustment of status
- **Naturalization (N-400)** - Generate naturalization application materials
- **U-Visa Application** - Create U-Visa petition packets
- **Criminal Records Analysis** - Analyze client criminal records
- **FOIA Request Generator** - Generate FOIA requests
- **Question Assistant** - AI-powered legal Q&A
- **API Key Management** - Use your own Gemini API key

## 🛠️ Run Locally

**Prerequisites:** Node.js 18+ and npm

1. Clone the repository:
   ```bash
   git clone https://github.com/joseangelcastaneda1-ai/Virtual-Legal-Assistant-1.0.git
   cd Virtual-Legal-Assistant-1.0
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env.local` file in the root directory:
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```
   
   Or use the Settings menu in the app to enter your API key directly.

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open your browser and navigate to `http://localhost:3000`

## 🔑 Getting Your API Key

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy your API key
5. Add it to Vercel environment variables or `.env.local` file

## 📦 Build for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## 🌐 Deployment Options

### Link (Recommended to use the app with the most recent updates)
### Run it locally


## ⚙️ Configuration

### Environment Variables

- `GEMINI_API_KEY` - Your Google Gemini API key (required)
- `VITE_GEMINI_API_KEY` - Alternative name for the API key

### Using Personal API Key

You can also enter your API key directly in the app:
1. Click the "⚙️ Settings" button in the header
2. Enter your Gemini API key
3. Click "Save API Key"
4. The app will reload and use your key

## 📝 License

This project is private and proprietary.

## 🤝 Support

For issues or questions, please open an issue on GitHub.

---

**Note:** This application uses AI to generate responses and draft materials. All outputs are AI-generated and may contain inaccuracies. The content does not constitute legal advice and should not be relied upon without independent verification.
