'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserPlus, Check, Search, Loader2 } from 'lucide-react';
import { searchUsers, followUser } from '@/actions/user';
import { useToast } from '@/hooks/use-toast';

export function AddFriendDialog() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const handleSearch = async () => {
      if (!query.trim()) return;
      setLoading(true);
      try {
          const users = await searchUsers(query);
          setResults(users);
          // Initialize following state based on result
          const followingIds = new Set(users.filter((u: any) => u.isFollowing).map((u: any) => u.id));
          setFollowing(followingIds);
      } catch (error) {
          console.error(error);
          toast({ variant: 'destructive', title: 'Error', description: 'Failed to search users' });
      } finally {
          setLoading(false);
      }
  };

  const handleFollow = async (userId: string) => {
      try {
          await followUser(userId);
          setFollowing(prev => new Set(prev).add(userId));
          toast({ title: 'Success', description: 'Friend added!' });
      } catch (error) {
          toast({ variant: 'destructive', title: 'Error', description: 'Failed to add friend' });
      }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
           <UserPlus className="h-4 w-4" />
           <span className="hidden sm:inline">Add Friend</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Friends</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
            <div className="flex gap-2">
                <Input
                    placeholder="Search by username..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button onClick={handleSearch} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {results.length === 0 && !loading && query && (
                    <p className="text-center text-muted-foreground py-4">No users found.</p>
                )}
                {results.map(user => (
                    <div key={user.id} className="flex items-center justify-between p-2 rounded-lg border">
                        <div className="flex items-center gap-3">
                            <Avatar>
                                <AvatarImage src={user.image} />
                                <AvatarFallback>{user.name?.slice(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{user.name}</span>
                        </div>
                        <Button
                            size="sm"
                            variant={following.has(user.id) ? "secondary" : "default"}
                            disabled={following.has(user.id)}
                            onClick={() => handleFollow(user.id)}
                        >
                            {following.has(user.id) ? <Check className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                        </Button>
                    </div>
                ))}
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
