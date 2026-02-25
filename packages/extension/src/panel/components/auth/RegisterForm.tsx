import { useState } from "preact/hooks";
import { authLoading, authError } from "../../signals/auth.js";
import { register } from "../../hooks/useAuth.js";

export function RegisterForm({ onSwitch }: { onSwitch: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (password !== confirm) {
      authError.value = "Passwords do not match";
      return;
    }
    register(username, password);
  };

  return (
    <form class="auth-form" onSubmit={handleSubmit}>
      <h2>Register</h2>
      {authError.value && <div class="error">{authError.value}</div>}
      <label>
        Username
        <input
          type="text"
          value={username}
          onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
          required
          minLength={3}
          maxLength={30}
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
          required
          minLength={8}
        />
      </label>
      <label>
        Confirm Password
        <input
          type="password"
          value={confirm}
          onInput={(e) => setConfirm((e.target as HTMLInputElement).value)}
          required
        />
      </label>
      <button type="submit" disabled={authLoading.value}>
        {authLoading.value ? "Registering..." : "Register"}
      </button>
      <p class="auth-switch">
        Already have an account?{" "}
        <a href="#" onClick={(e) => { e.preventDefault(); onSwitch(); }}>
          Login
        </a>
      </p>
    </form>
  );
}
