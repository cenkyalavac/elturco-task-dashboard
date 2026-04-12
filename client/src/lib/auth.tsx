import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { apiRequest, setAuthToken, setCurrentUser, getAuthToken, getCurrentUser } from "./queryClient";

interface User {
  id: number;
  email: string;
  name: string;
  initial?: string;
  role: string;
  defaultFilter?: string;
  defaultMyProjects?: boolean;
  defaultSource?: string;
  defaultAccount?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Restore user from persisted auth (window.name) on mount
  const [user, setUser] = useState<User | null>(() => {
    const saved = getCurrentUser();
    return saved as User | null;
  });
  const [isLoading, setIsLoading] = useState(false);

  // Validate persisted session on mount
  useEffect(() => {
    const token = getAuthToken();
    const savedUser = getCurrentUser();
    if (token && savedUser) {
      // Validate the session is still active using the dedicated auth endpoint
      setIsLoading(true);
      apiRequest("GET", "/api/auth/me")
        .then(async (res) => {
          const userData = await res.json();
          // Update stored user with fresh data from the server
          if (userData && userData.id) {
            setCurrentUser(userData);
            setUser(userData as User);
          } else {
            setUser(savedUser as User);
          }
          setIsLoading(false);
        })
        .catch(() => {
          // Session expired, clear auth
          setAuthToken(null);
          setCurrentUser(null);
          setUser(null);
          setIsLoading(false);
        });
    }
  }, []);

  const login = useCallback((token: string, userData: User) => {
    setAuthToken(token);
    setCurrentUser(userData);
    setUser(userData);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch {}
    setAuthToken(null);
    setCurrentUser(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
