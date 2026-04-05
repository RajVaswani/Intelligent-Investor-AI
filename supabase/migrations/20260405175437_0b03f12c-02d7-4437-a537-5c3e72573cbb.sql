
-- Create user_secrets table
CREATE TABLE public.user_secrets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    ibkr_flex_token text,
    ibkr_gateway_url text,
    ibkr_query_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_secrets ENABLE ROW LEVEL SECURITY;

-- Users can insert their own secrets
CREATE POLICY "Users can insert own secrets"
ON public.user_secrets
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can update their own secrets
CREATE POLICY "Users can update own secrets"
ON public.user_secrets
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- NO SELECT policy for users — secrets are write-only from client
-- Edge functions use service_role key to read

-- Add updated_at trigger
CREATE TRIGGER update_user_secrets_updated_at
BEFORE UPDATE ON public.user_secrets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Remove sensitive columns from profiles
ALTER TABLE public.profiles DROP COLUMN IF EXISTS ibkr_flex_token;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS ibkr_gateway_url;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS ibkr_query_id;
