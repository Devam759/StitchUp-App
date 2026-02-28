import React, { useState, useEffect } from 'react'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import Input from '../components/ui/Input'
import PrimaryButton from '../components/ui/PrimaryButton'
import OTPModal from '../components/OTPModal'
import Toast from '../components/Toast'
import OTPTroubleshootModal from '../components/OTPTroubleshootModal'
import { Link, useNavigate } from 'react-router-dom'
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'



const Login = () => {
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [errors, setErrors] = useState({})
  const [otpOpen, setOtpOpen] = useState(false)
  const [toast, setToast] = useState(false)
  const [confirmationResult, setConfirmationResult] = useState(null)
  const [otpLoading, setOtpLoading] = useState(false)
  const [showTroubleshoot, setShowTroubleshoot] = useState(false)

  // Clean implementation of Firebase Auth with Invisible Recaptcha
  useEffect(() => {
    // 1. Initialize Recaptcha cleanly on mount
    const initRecaptcha = () => {
      // Clear any existing instances
      if (window.recaptchaVerifier) {
        try { window.recaptchaVerifier.clear(); } catch (err) { console.warn("Error clearing reCAPTCHA verifier:", err); }
        window.recaptchaVerifier = null;
      }

      try {
        // Ensure DOM element exists before creating verifier
        const recaptchaContainer = document.getElementById('recaptcha-container');
        if (!recaptchaContainer) {
          // Create the container element if it doesn't exist
          const container = document.createElement('div');
          container.id = 'recaptcha-container';
          container.style.display = 'none'; // Keep invisible
          document.body.appendChild(container);
        }

        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible',
          callback: (response) => {
            // reCAPTCHA solved
            console.log("Recaptcha verified:", response);
          },
          'expired-callback': () => {
            console.log("Recaptcha expired");
            // Optionally re-initialize after a delay to avoid rapid re-initialization
            setTimeout(initRecaptcha, 1000);
          },
          'error-callback': (error) => {
            console.error("Recaptcha error:", error);
            setErrors({ form: "reCAPTCHA verification failed. Please try again." });
          }
        });

        // Render the widget to ensure it's properly initialized
        window.recaptchaVerifier.render()
          .then(function (widgetId) {
            console.log("reCAPTCHA widget rendered with ID:", widgetId);
          })
          .catch(function (error) {
            console.error("reCAPTCHA render error:", error);
          });
      } catch (err) {
        console.error("Failed to initialize Recaptcha:", err);
        setErrors({ form: "Failed to initialize reCAPTCHA. Please refresh the page." });
      }
    };

    initRecaptcha();

    // Cleanup on unmount
    return () => {
      if (window.recaptchaVerifier) {
        try {
          window.recaptchaVerifier.clear();
        } catch (err) {
          console.warn("Error clearing reCAPTCHA verifier:", err);
        }
        window.recaptchaVerifier = null;
      }
    };
  }, []);

  const handleGetOtp = async (e) => {
    if (e) e.preventDefault()

    if (!phone || phone.replace(/\D/g, '').length < 10) {
      setErrors({ phone: 'Enter a valid 10-digit phone number' })
      return
    }

    setOtpLoading(true)
    setErrors({})

    try {
      const phoneDigits = phone.replace(/\D/g, '');
      if (phoneDigits.length < 10) {
        setErrors({ phone: 'Phone number must be at least 10 digits' });
        setOtpLoading(false);
        return;
      }

      // Format phone number with country code
      const formattedPhone = '+91' + phoneDigits;
      console.log("Formatted phone number:", formattedPhone);

      // Failsafe: if verifier was somehow destroyed, re-create it
      if (!window.recaptchaVerifier) {
        console.log("Recreating reCAPTCHA verifier");
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible',
          'callback': (response) => {
            console.log("reCAPTCHA verified:", response);
          },
          'expired-callback': () => {
            console.log("reCAPTCHA expired");
          }
        });
      }

      console.log("Attempting to send OTP to:", formattedPhone);
      const confirmation = await signInWithPhoneNumber(auth, formattedPhone, window.recaptchaVerifier);
      setConfirmationResult(confirmation);

      console.log("OTP Sent Successfully");
      setOtpOpen(true);

    } catch (error) {
      console.error('Phone Auth Error:', error)
      let msg = error.message

      if (error.code === 'auth/invalid-app-credential') {
        msg = 'App verification failed. Please check Firebase "Authorized Domains".'
      } else if (error.code === 'auth/too-many-requests') {
        msg = 'Too many attempts. Please try again later.'
      } else if (error.code === 'auth/operation-not-allowed') {
        msg = 'Phone authentication is not enabled for this Firebase project. Please contact the administrator to enable phone authentication in Firebase Console.'
      } else if (error.code === 'auth/captcha-check-failed') {
        msg = 'Security verification failed. Please refresh the page and try again.'
      } else if (error.code === 'auth/quota-exceeded') {
        msg = 'SMS quota exceeded. Please contact support or try again later.'
      } else if (error.code === 'auth/user-disabled') {
        msg = 'This account has been disabled. Please contact support.'
      } else if (error.code.includes('network-request-failed')) {
        msg = 'Network error. Please check your internet connection and try again.'
      }

      setErrors({ form: `Error: ${msg}` })
    } finally {
      setOtpLoading(false)
    }
  }

  const handleVerifyOtp = async (otpString) => {
    if (!otpString || otpString.length !== 6) {
      setErrors({ form: 'OTP must be exactly 6 digits.' })
      return
    }

    try {
      if (!confirmationResult) {
        setErrors({ form: 'Session expired. Please request a new OTP.' })
        setOtpOpen(false)
        return
      }

      console.log("Attempting to confirm OTP...");
      const res = await confirmationResult.confirm(otpString);
      console.log("User logged in successfully:", res.user.uid);

      // Define default temporary user outside the try block so the catch block can use it
      let targetUser = { id: res.user.uid, uid: res.user.uid, phone: phone.replace(/\D/g, ''), role: 'customer', fullName: 'User', createdAt: new Date().toISOString() }

      try {
        const userRef = doc(db, 'users', res.user.uid)

        // Race Firestore read against a 600ms timeout for instant feeling
        const userResult = await Promise.race([
          getDoc(userRef).catch(() => null),
          new Promise(resolve => setTimeout(() => resolve('timeout'), 600))
        ])

        if (userResult !== 'timeout' && userResult && userResult.exists()) {
          targetUser = { id: userResult.id, uid: res.user.uid, ...userResult.data() }
        } else if (userResult !== 'timeout') {
          // If it didn't timeout and doesn't exist, background create it
          setDoc(userRef, targetUser).catch(() => console.error("Background setDoc failed"))
        }

        localStorage.setItem('currentUser', JSON.stringify(targetUser))
        window.dispatchEvent(new Event('authChange'))
        setOtpOpen(false)
        navigate(targetUser.role === 'tailor' ? '/tailor/dashboard' : '/customer')
      } catch (dbError) {
        console.error('Firestore or Auth error:', dbError)

        const tempUser = { ...targetUser, isTemporary: true }
        localStorage.setItem('currentUser', JSON.stringify(tempUser))
        window.dispatchEvent(new Event('authChange'))
        setOtpOpen(false)
        navigate('/customer')
      }
    } catch (error) {
      console.error('OTP Verification Error:', error)
      console.log('Error code:', error.code);
      console.log('Error message:', error.message);

      let msg = error.message;
      if (error.code === 'auth/invalid-verification-code') {
        msg = 'The OTP you entered is incorrect. Please try again.';
      } else if (error.code === 'auth/code-expired') {
        msg = 'The OTP has expired. Please request a new one.';
        setOtpOpen(false); // Close the modal since the code is expired
      } else if (error.code === 'auth/network-request-failed') {
        msg = 'Network error. Please check your connection and try again.';
      } else if (error.code === 'auth/too-many-requests') {
        msg = 'Too many attempts. Please try again later.';
      } else {
        msg = `Verification failed: ${error.message}`;
      }

      setErrors({ form: msg });
      // Don't close the modal here - let the user try again or request new OTP
    }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-neutral-50">
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link to="/">
              <img src="/logo2.png" alt="StitchUp" className="h-10 mx-auto mb-6" />
            </Link>
            <h1 className="text-2xl font-bold text-neutral-900">Welcome back</h1>
            <p className="mt-2 text-neutral-500 text-sm">Enter your phone number to continue</p>
          </div>

          <form onSubmit={handleGetOtp} className="bg-white rounded-xl border border-neutral-200 p-6 shadow-sm">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">Phone Number</label>
                <div className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2.5 bg-white focus-within:border-[color:var(--color-primary)] focus-within:ring-1 focus-within:ring-[color:var(--color-primary)]/20 transition-all">
                  <span className="text-neutral-400 text-sm">+91</span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="98765 43210"
                    className="flex-1 outline-none bg-transparent text-neutral-900"
                    maxLength={12}
                  />
                </div>
                {errors.phone && <p className="mt-1.5 text-xs text-red-600">{errors.phone}</p>}
              </div>

              <PrimaryButton type="submit" className="w-full py-3" disabled={otpLoading}>
                {otpLoading ? 'Loading Secure Check...' : 'Continue with OTP'}
              </PrimaryButton>

              {errors.form && <p className="text-sm text-red-600 text-center">{errors.form}</p>}

              <div className="text-center mt-4">
                <button
                  type="button"
                  className="text-xs text-[color:var(--color-primary)] hover:underline"
                  onClick={() => setShowTroubleshoot(true)}
                >
                  Having trouble with OTP?
                </button>
              </div>
            </div>

            <div id="recaptcha-container"></div>
          </form>

          <p className="text-center mt-6 text-sm text-neutral-500">
            Don't have an account?{' '}
            <Link to="/signup" className="text-[color:var(--color-primary)] font-medium hover:underline">Create one</Link>
          </p>
        </div>
      </main>
      <Footer />
      <OTPModal open={otpOpen} onClose={() => setOtpOpen(false)} onVerify={handleVerifyOtp} />
      <Toast open={toast} type="success" message="Logged in successfully" />
      <OTPTroubleshootModal
        isOpen={showTroubleshoot}
        onClose={() => setShowTroubleshoot(false)}
      />
    </div>
  )
}

export default Login
