import { useEffect, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type TutorialVideo = { id: string; title: string; description: string | null; video_url: string; position: number };

export default function Tutorial() {
  const [videos, setVideos] = useState<TutorialVideo[]>([]);
  useEffect(() => {
    supabase.from("tutorial_videos").select("id,title,description,video_url,position").eq("is_published", true).order("position").then(({ data }) => setVideos((data || []) as TutorialVideo[]));
  }, []);
  return (
    <DashboardShell title="Tutorial" description="Aprenda a usar a Muwoyo passo a passo.">
      <div className="grid gap-5 lg:grid-cols-2">
        {videos.map((video) => (
          <Card key={video.id} className="overflow-hidden border-border/70 shadow-sm">
            <div className="aspect-video bg-black"><iframe className="h-full w-full" src={video.video_url} title={video.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div>
            <CardHeader><CardTitle className="text-lg">{video.title}</CardTitle>{video.description && <p className="text-sm text-muted-foreground">{video.description}</p>}</CardHeader>
          </Card>
        ))}
        {!videos.length && <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Os tutoriais serão adicionados em breve.</CardContent></Card>}
      </div>
    </DashboardShell>
  );
}
