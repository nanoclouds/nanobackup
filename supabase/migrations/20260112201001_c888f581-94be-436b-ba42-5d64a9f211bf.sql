-- Create enum types for the application
CREATE TYPE public.user_role AS ENUM ('admin', 'operator', 'viewer');
CREATE TYPE public.environment_type AS ENUM ('production', 'staging', 'development');
CREATE TYPE public.job_status AS ENUM ('scheduled', 'running', 'success', 'failed', 'cancelled');
CREATE TYPE public.backup_format AS ENUM ('custom', 'sql');
CREATE TYPE public.compression_type AS ENUM ('gzip', 'zstd', 'none');
CREATE TYPE public.ftp_protocol AS ENUM ('ftp', 'ftps', 'sftp');
CREATE TYPE public.connection_status AS ENUM ('online', 'offline', 'unknown', 'connected', 'disconnected');
CREATE TYPE public.criticality_level AS ENUM ('low', 'medium', 'high', 'critical');

-- Create profiles table for user management
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  role user_role NOT NULL DEFAULT 'viewer',
  environments environment_type[] DEFAULT ARRAY['development']::environment_type[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_login TIMESTAMP WITH TIME ZONE
);

-- Create user_roles table for RBAC (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role user_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Create PostgreSQL instances table
CREATE TABLE public.postgres_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 5432,
  database TEXT NOT NULL,
  username TEXT NOT NULL,
  password TEXT NOT NULL, -- Will be encrypted at application level
  ssl_enabled BOOLEAN NOT NULL DEFAULT false,
  version TEXT,
  client_tag TEXT,
  environment environment_type NOT NULL DEFAULT 'development',
  criticality criticality_level DEFAULT 'medium',
  status connection_status NOT NULL DEFAULT 'unknown',
  last_checked TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create FTP destinations table
CREATE TABLE public.ftp_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  protocol ftp_protocol NOT NULL DEFAULT 'sftp',
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 22,
  username TEXT NOT NULL,
  password TEXT, -- For FTP/FTPS
  ssh_key TEXT, -- For SFTP
  base_directory TEXT NOT NULL DEFAULT '/',
  passive_mode BOOLEAN DEFAULT false,
  status connection_status NOT NULL DEFAULT 'unknown',
  last_tested TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create backup jobs table
CREATE TABLE public.backup_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  instance_id UUID NOT NULL REFERENCES public.postgres_instances(id) ON DELETE CASCADE,
  destination_id UUID NOT NULL REFERENCES public.ftp_destinations(id) ON DELETE CASCADE,
  format backup_format NOT NULL DEFAULT 'custom',
  compression compression_type NOT NULL DEFAULT 'gzip',
  schedule TEXT NOT NULL DEFAULT '0 2 * * *', -- Cron expression
  enabled BOOLEAN NOT NULL DEFAULT true,
  retention_count INTEGER,
  retention_days INTEGER,
  timeout INTEGER NOT NULL DEFAULT 3600, -- in seconds
  status job_status NOT NULL DEFAULT 'scheduled',
  last_run TIMESTAMP WITH TIME ZONE,
  next_run TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create backup executions table
CREATE TABLE public.backup_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.backup_jobs(id) ON DELETE CASCADE,
  status job_status NOT NULL DEFAULT 'running',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  duration INTEGER, -- in seconds
  file_size BIGINT, -- in bytes
  file_name TEXT,
  checksum TEXT,
  error_message TEXT,
  logs TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create alerts table
CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.backup_jobs(id) ON DELETE CASCADE,
  execution_id UUID REFERENCES public.backup_executions(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'failure', 'success', 'warning', 'missed_schedule'
  title TEXT NOT NULL,
  message TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create notification settings table
CREATE TABLE public.notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_on_failure BOOLEAN NOT NULL DEFAULT true,
  email_on_success BOOLEAN NOT NULL DEFAULT false,
  webhook_url TEXT,
  webhook_on_failure BOOLEAN NOT NULL DEFAULT false,
  webhook_on_success BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable Row Level Security on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.postgres_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ftp_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

-- Security definer function to check user role (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role user_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Function to get user role from profiles
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

-- Function to check if user can modify data (admin or operator)
CREATE OR REPLACE FUNCTION public.can_modify(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id AND role IN ('admin', 'operator')
  )
$$;

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id AND role = 'admin'
  )
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "System can insert profiles" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for user_roles
CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies for postgres_instances
CREATE POLICY "Authenticated users can view instances" ON public.postgres_instances
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins and operators can insert instances" ON public.postgres_instances
  FOR INSERT TO authenticated
  WITH CHECK (public.can_modify(auth.uid()));

CREATE POLICY "Admins and operators can update instances" ON public.postgres_instances
  FOR UPDATE TO authenticated
  USING (public.can_modify(auth.uid()));

CREATE POLICY "Admins can delete instances" ON public.postgres_instances
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- RLS Policies for ftp_destinations
CREATE POLICY "Authenticated users can view destinations" ON public.ftp_destinations
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins and operators can insert destinations" ON public.ftp_destinations
  FOR INSERT TO authenticated
  WITH CHECK (public.can_modify(auth.uid()));

CREATE POLICY "Admins and operators can update destinations" ON public.ftp_destinations
  FOR UPDATE TO authenticated
  USING (public.can_modify(auth.uid()));

CREATE POLICY "Admins can delete destinations" ON public.ftp_destinations
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- RLS Policies for backup_jobs
CREATE POLICY "Authenticated users can view jobs" ON public.backup_jobs
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins and operators can insert jobs" ON public.backup_jobs
  FOR INSERT TO authenticated
  WITH CHECK (public.can_modify(auth.uid()));

CREATE POLICY "Admins and operators can update jobs" ON public.backup_jobs
  FOR UPDATE TO authenticated
  USING (public.can_modify(auth.uid()));

CREATE POLICY "Admins can delete jobs" ON public.backup_jobs
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- RLS Policies for backup_executions
CREATE POLICY "Authenticated users can view executions" ON public.backup_executions
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "System can manage executions" ON public.backup_executions
  FOR ALL TO authenticated
  USING (public.can_modify(auth.uid()));

-- RLS Policies for alerts
CREATE POLICY "Authenticated users can view alerts" ON public.alerts
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can update alert read status" ON public.alerts
  FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "System can insert alerts" ON public.alerts
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- RLS Policies for notification_settings
CREATE POLICY "Users can manage their own settings" ON public.notification_settings
  FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_postgres_instances_updated_at
  BEFORE UPDATE ON public.postgres_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ftp_destinations_updated_at
  BEFORE UPDATE ON public.ftp_destinations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_backup_jobs_updated_at
  BEFORE UPDATE ON public.backup_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_notification_settings_updated_at
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    CASE 
      WHEN NOT EXISTS (SELECT 1 FROM public.profiles) THEN 'admin'::user_role
      ELSE 'viewer'::user_role
    END
  );
  
  -- Also add to user_roles table
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    CASE 
      WHEN NOT EXISTS (SELECT 1 FROM public.user_roles) THEN 'admin'::user_role
      ELSE 'viewer'::user_role
    END
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create indexes for better performance
CREATE INDEX idx_backup_jobs_instance_id ON public.backup_jobs(instance_id);
CREATE INDEX idx_backup_jobs_destination_id ON public.backup_jobs(destination_id);
CREATE INDEX idx_backup_executions_job_id ON public.backup_executions(job_id);
CREATE INDEX idx_backup_executions_status ON public.backup_executions(status);
CREATE INDEX idx_backup_executions_started_at ON public.backup_executions(started_at DESC);
CREATE INDEX idx_alerts_read ON public.alerts(read);
CREATE INDEX idx_alerts_created_at ON public.alerts(created_at DESC);