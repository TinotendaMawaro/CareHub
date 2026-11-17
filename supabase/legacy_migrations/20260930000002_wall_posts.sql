-- Message wall for dashboard announcements
CREATE TABLE IF NOT EXISTS public.wall_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id text NOT NULL,
  author_name text NOT NULL,
  content text NOT NULL,
  priority text NOT NULL DEFAULT 'normal',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wall_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view wall posts"
  ON public.wall_posts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert wall posts"
  ON public.wall_posts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can update wall posts"
  ON public.wall_posts FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Admins can delete wall posts"
  ON public.wall_posts FOR DELETE
  TO authenticated
  USING (true);
