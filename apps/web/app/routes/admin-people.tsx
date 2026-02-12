import { useState } from "react";
import { Form, useNavigation, useSubmit } from "react-router";
import { requireAuth } from "../lib/auth.server";
import type { Route } from "./+types/admin-people";
import {
  getAllPeople,
  getAllOrganizations,
  createPerson,
  updatePerson,
  addMembership,
  deleteMembership,
} from "../services/admin";
import { getSupabaseAdminClient } from "../lib/supabase.server";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import { Plus, Search, Trash2, Edit2, Shield, Calendar } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  await requireAuth(request);
  const supabase = getSupabaseAdminClient();
  const [people, organizations] = await Promise.all([
    getAllPeople(supabase),
    getAllOrganizations(supabase),
  ]);
  return { people, organizations };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const supabase = getSupabaseAdminClient();
  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    if (intent === "create_person") {
      const name = formData.get("name") as string;
      await createPerson(supabase, name);
    } else if (intent === "update_person") {
      const id = formData.get("id") as string;
      const name = formData.get("name") as string;
      const is_councillor = formData.get("is_councillor") === "on";
      await updatePerson(supabase, id, { name, is_councillor });
    } else if (intent === "add_membership") {
      const person_id = formData.get("person_id") as string;
      const organization_id = formData.get("organization_id") as string;
      const role = formData.get("role") as string;
      const start_date = (formData.get("start_date") as string) || undefined;
      const end_date = (formData.get("end_date") as string) || undefined;

      await addMembership(supabase, {
        person_id: parseInt(person_id),
        organization_id: parseInt(organization_id),
        role,
        start_date,
        end_date,
      });
    } else if (intent === "delete_membership") {
      const id = formData.get("id") as string;
      await deleteMembership(supabase, id);
    }
    return { success: true };
  } catch (e: any) {
    return { error: e.message };
  }
}

export default function AdminPeople({ loaderData }: Route.ComponentProps) {
  const { people, organizations } = loaderData;
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const submit = useSubmit();
  const navigation = useNavigation();

  const filteredPeople = people.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleEdit = (person: any) => {
    setSelectedPerson(person);
    setIsDialogOpen(true);
  };

  const handleClose = () => {
    setIsDialogOpen(false);
    setSelectedPerson(null);
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900">People Manager</h1>
          <p className="text-zinc-500">
            Manage people, council members, and memberships.
          </p>
        </div>
        <div className="flex gap-4">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" /> Add Person
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Person</DialogTitle>
              </DialogHeader>
              <Form method="post" className="space-y-4">
                <input type="hidden" name="intent" value="create_person" />
                <Input name="name" placeholder="Full Name" required />
                <Button type="submit" className="w-full">
                  Create
                </Button>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-zinc-50 border-b">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Roles</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredPeople.map((person) => (
              <tr key={person.id} className="hover:bg-zinc-50">
                <td className="px-4 py-3 font-medium flex items-center gap-2">
                  {person.is_councillor && (
                    <Shield className="h-3 w-3 text-blue-600" />
                  )}
                  {person.name}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {person.memberships?.map((m: any) => (
                      <Badge
                        key={m.id}
                        variant="outline"
                        className="text-xs font-normal"
                      >
                        {m.role} @ {m.organization?.name}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(person)}
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Person: {selectedPerson?.name}</DialogTitle>
          </DialogHeader>

          {selectedPerson && (
            <div className="space-y-8">
              {/* Person Details Form */}
              <Form method="post" className="space-y-4 border-b pb-6">
                <input type="hidden" name="intent" value="update_person" />
                <input type="hidden" name="id" value={selectedPerson.id} />
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Name</label>
                    <Input name="name" defaultValue={selectedPerson.name} />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <input
                      type="checkbox"
                      name="is_councillor"
                      id="is_councillor"
                      defaultChecked={selectedPerson.is_councillor}
                      className="rounded border-zinc-300"
                    />
                    <label htmlFor="is_councillor" className="text-sm">
                      Is Councillor / Mayor
                    </label>
                  </div>
                </div>
                <Button type="submit" variant="secondary" size="sm">
                  Update Details
                </Button>
              </Form>

              {/* Memberships Section */}
              <div className="space-y-4">
                <h3 className="font-medium text-sm flex items-center gap-2">
                  <Calendar className="h-4 w-4" /> Memberships
                </h3>

                <div className="bg-zinc-50 rounded-lg border p-4 space-y-2 max-h-48 overflow-y-auto">
                  {selectedPerson.memberships?.length === 0 && (
                    <p className="text-xs text-zinc-500 italic">
                      No memberships recorded.
                    </p>
                  )}
                  {selectedPerson.memberships?.map((m: any) => (
                    <div
                      key={m.id}
                      className="flex justify-between items-center text-xs bg-white p-2 rounded border"
                    >
                      <div>
                        <span className="font-bold">{m.role}</span> at{" "}
                        <span className="text-zinc-600">
                          {m.organization?.name}
                        </span>
                        <div className="text-[10px] text-zinc-400 mt-0.5">
                          {m.start_date || "?"} — {m.end_date || "Present"}
                        </div>
                      </div>
                      <Form method="post">
                        <input
                          type="hidden"
                          name="intent"
                          value="delete_membership"
                        />
                        <input type="hidden" name="id" value={m.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </Form>
                    </div>
                  ))}
                </div>

                {/* Add Membership Form */}
                <div className="bg-blue-50/50 rounded-lg border border-blue-100 p-4">
                  <h4 className="text-xs font-bold text-blue-900 mb-3">
                    Add Membership
                  </h4>
                  <Form method="post" className="grid grid-cols-2 gap-3">
                    <input type="hidden" name="intent" value="add_membership" />
                    <input
                      type="hidden"
                      name="person_id"
                      value={selectedPerson.id}
                    />

                    <div className="col-span-2">
                      <select
                        name="organization_id"
                        className="w-full rounded-md border border-zinc-200 text-sm p-2"
                        required
                      >
                        <option value="">Select Organization...</option>
                        {organizations.map((org) => (
                          <option key={org.id} value={org.id}>
                            {org.name} ({org.classification})
                          </option>
                        ))}
                      </select>
                    </div>

                    <Input
                      name="role"
                      placeholder="Role (e.g. Member, Chair)"
                      required
                    />

                    <div className="grid grid-cols-2 gap-2 col-span-2">
                      <Input
                        name="start_date"
                        type="date"
                        placeholder="Start Date"
                      />
                      <Input
                        name="end_date"
                        type="date"
                        placeholder="End Date"
                      />
                    </div>

                    <div className="col-span-2">
                      <Button
                        type="submit"
                        size="sm"
                        className="w-full bg-blue-600 hover:bg-blue-700"
                      >
                        Add Membership
                      </Button>
                    </div>
                  </Form>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
